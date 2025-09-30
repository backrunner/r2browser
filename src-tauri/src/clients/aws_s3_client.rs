use crate::types::{S3Object, ListObjectsResponse, StorageError, ObjectMetadata, PreSignedUrlResponse};
use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::{
    config::{Builder as S3ConfigBuilder, SharedCredentialsProvider},
    primitives::ByteStream,
    presigning::PresigningConfig,
    Client,
};
use aws_smithy_runtime_api::client::result::SdkError;
use aws_smithy_types::error::metadata::ProvideErrorMetadata;
use bytes::Bytes;
use chrono::{DateTime, Utc};
use tracing::{debug, error, info};
use std::collections::HashMap;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tauri::Emitter; // for window.emit

/// AWS S3 client implementation using the official AWS SDK
#[derive(Clone)]
pub struct AwsS3Client {
    client: Client,
    bucket_name: String,
}

impl AwsS3Client {
    /// Create a new AWS S3 client
    pub async fn new(
        endpoint: Option<String>,
        region: String,
        access_key_id: String,
        secret_access_key: String,
        bucket_name: String,
        force_path_style: Option<bool>,
    ) -> Result<Self, StorageError> {
        debug!("Creating AWS S3 client for bucket: {}", bucket_name);

        // Create credentials
        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None, // session_token
            None, // expiry
            "r2browser", // provider_name
        );

        let credentials_provider = SharedCredentialsProvider::new(credentials);
        let region = Region::new(region.clone());

        // Build S3 config
        let mut config_builder = S3ConfigBuilder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(region.clone())
            .credentials_provider(credentials_provider);

        // Set custom endpoint if provided
        if let Some(endpoint_url) = endpoint {
            config_builder = config_builder.endpoint_url(endpoint_url);
        }

        // Set force path style if specified
        if force_path_style.unwrap_or(false) {
            config_builder = config_builder.force_path_style(true);
        }

        let config = config_builder.build();
        let client = Client::from_conf(config);

        info!("AWS S3 client created successfully for region: {}", region);

        Ok(Self {
            client,
            bucket_name,
        })
    }

    /// Test connection to S3 by attempting to list objects
    pub async fn test_connection(&self) -> Result<(), StorageError> {
        debug!("Testing S3 connection for bucket: {}", self.bucket_name);

        match self.list_objects(None, Some(1), None).await {
            Ok(_) => {
                info!("S3 connection test successful");
                Ok(())
            }
            Err(e) => {
                error!("S3 connection test failed: {}", e);
                Err(e)
            }
        }
    }

    /// List objects in the bucket
    pub async fn list_objects(
        &self,
        prefix: Option<String>,
        max_keys: Option<i32>,
        continuation_token: Option<String>,
    ) -> Result<ListObjectsResponse, StorageError> {
        debug!("Listing objects with prefix: {:?}", prefix);

        let mut request = self
            .client
            .list_objects_v2()
            .bucket(&self.bucket_name)
            .delimiter("/"); // Always use delimiter for folder-like behavior

        if let Some(prefix) = &prefix {
            request = request.prefix(prefix);
        }

        if let Some(max_keys) = max_keys {
            request = request.max_keys(max_keys);
        }

        if let Some(token) = continuation_token {
            request = request.continuation_token(token);
        }

        let response = request
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "list_objects"))?;

        // Convert AWS response to our format
        let objects = response
            .contents()
            .iter()
            .filter_map(|obj| {
                let key = obj.key()?;
                let size = obj.size().unwrap_or(0);
                let last_modified = obj.last_modified()?;
                let etag = obj.e_tag().unwrap_or("").to_string();
                let storage_class = obj.storage_class().map(|sc| sc.as_str().to_string());

                // Convert AWS DateTime to chrono DateTime
                let last_modified_utc = DateTime::from_timestamp(
                    last_modified.secs(),
                    last_modified.subsec_nanos(),
                )?;

                Some(S3Object {
                    key: key.to_string(),
                    size,
                    last_modified: last_modified_utc,
                    etag,
                    storage_class,
                    content_type: None, // Not available in list response
                    metadata: None,     // Not available in list response
                })
            })
            .collect();

        let common_prefixes = response
            .common_prefixes()
            .iter()
            .filter_map(|cp| cp.prefix().map(|p| p.to_string()))
            .collect();

        let list_response = ListObjectsResponse {
            objects,
            common_prefixes,
            continuation_token: response.next_continuation_token().map(|s| s.to_string()),
            is_truncated: response.is_truncated().unwrap_or(false),
            prefix,
        };

        debug!("Listed {} objects and {} prefixes",
               list_response.objects.len(),
               list_response.common_prefixes.len());

        Ok(list_response)
    }

    /// Get an object from the bucket
    pub async fn get_object(&self, key: &str) -> Result<Bytes, StorageError> {
        debug!("Getting object: {}", key);

        let response = self
            .client
            .get_object()
            .bucket(&self.bucket_name)
            .key(key)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "get_object"))?;

        let data = response
            .body
            .collect()
            .await
            .map_err(|e| StorageError::DownloadFailed(format!("Failed to read object data: {}", e)))?;

        let bytes = data.into_bytes();
        info!("Successfully retrieved object: {} ({} bytes)", key, bytes.len());
        Ok(bytes)
    }

    /// Download a file with progress reporting and resume capability
    pub async fn download_file_with_progress(
        &self,
        key: &str,
        save_path: &str,
        window: &tauri::Window,
        task_id: &str,
        resume_from: Option<u64>,
    ) -> Result<(), StorageError> {
        debug!("Downloading object: {} to {}", key, save_path);

        // Get object metadata to know the total size
        let metadata = self.get_object_metadata(key).await?;
        let total_size = metadata.size as u64;

        // Determine starting position
        let start_from = resume_from.unwrap_or(0);

        // Open file for writing (create or append)
        let file = if start_from > 0 {
            // Resume mode: open existing file for appending
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(save_path)
                .await
        } else {
            // New download: create new file
            tokio::fs::File::create(save_path)
                .await
        };

        let mut file = file.map_err(|e| StorageError::OperationFailed(format!("Failed to open file: {}", e)))?;

        // Helper to emit progress
        let emit_progress = |downloaded: u64| {
            let _ = window.emit(
                "download_progress",
                serde_json::json!({
                    "task_id": task_id,
                    "downloaded": downloaded,
                    "total": total_size,
                    "progress": if total_size > 0 { (downloaded as f64) * 100.0 / (total_size as f64) } else { 0.0 }
                }),
            );
        };

        // Emit initial progress
        emit_progress(start_from);

        const CHUNK_SIZE: u64 = 8 * 1024 * 1024; // 8 MiB chunks
        let mut downloaded = start_from;

        while downloaded < total_size {
            let end = std::cmp::min(downloaded + CHUNK_SIZE - 1, total_size - 1);
            let range = format!("bytes={}-{}", downloaded, end);

            debug!("Downloading range: {}", range);

            let response = self
                .client
                .get_object()
                .bucket(&self.bucket_name)
                .key(key)
                .range(range)
                .send()
                .await
                .map_err(|e| self.map_s3_error(e, "get_object_range"))?;

            // Collect the chunk data
            let chunk_data = response.body.collect().await
                .map_err(|e| StorageError::DownloadFailed(format!("Failed to read chunk: {}", e)))?;

            let chunk_bytes = chunk_data.into_bytes();
            let chunk_size = chunk_bytes.len() as u64;

            // Write chunk to file
            use tokio::io::AsyncWriteExt;
            file.write_all(&chunk_bytes).await
                .map_err(|e| StorageError::OperationFailed(format!("Failed to write to file: {}", e)))?;

            downloaded += chunk_size;
            emit_progress(downloaded);

            debug!("Downloaded chunk: {} bytes", chunk_size);
        }

        // Flush and sync file
        use tokio::io::AsyncWriteExt;
        file.flush().await
            .map_err(|e| StorageError::OperationFailed(format!("Failed to flush file: {}", e)))?;
        file.sync_all().await
            .map_err(|e| StorageError::OperationFailed(format!("Failed to sync file: {}", e)))?;

        info!("Successfully downloaded object: {} to {} ({} bytes)", key, save_path, total_size);
        Ok(())
    }

    /// Put an object into the bucket
    pub async fn put_object(&self, key: &str, data: Bytes, content_type: Option<&str>) -> Result<(), StorageError> {
        debug!("Putting object: {} ({} bytes)", key, data.len());

        let body = ByteStream::from(data);
        let mut request = self
            .client
            .put_object()
            .bucket(&self.bucket_name)
            .key(key)
            .body(body);

        if let Some(content_type) = content_type {
            request = request.content_type(content_type);
        }

        request
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "put_object"))?;

        info!("Successfully uploaded object: {}", key);
        Ok(())
    }

    /// Delete an object from the bucket
    pub async fn delete_object(&self, key: &str) -> Result<(), StorageError> {
        debug!("Deleting object: {}", key);

        self.client
            .delete_object()
            .bucket(&self.bucket_name)
            .key(key)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "delete_object"))?;

        info!("Successfully deleted object: {}", key);
        Ok(())
    }

    /// Copy an object within the bucket
    pub async fn copy_object(&self, source_key: &str, dest_key: &str) -> Result<(), StorageError> {
        debug!("Copying object from {} to {}", source_key, dest_key);

        let copy_source = format!("{}/{}", self.bucket_name, source_key);

        self.client
            .copy_object()
            .bucket(&self.bucket_name)
            .key(dest_key)
            .copy_source(&copy_source)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "copy_object"))?;

        info!("Successfully copied object from {} to {}", source_key, dest_key);
        Ok(())
    }

    /// Get object metadata
    pub async fn get_object_metadata(&self, key: &str) -> Result<ObjectMetadata, StorageError> {
        debug!("Getting metadata for object: {}", key);

        let response = self
            .client
            .head_object()
            .bucket(&self.bucket_name)
            .key(key)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "head_object"))?;

        let size = response.content_length().unwrap_or(0);
        let content_type = response.content_type().map(|s| s.to_string());
        let etag = response.e_tag().unwrap_or("").to_string();

        let last_modified = response
            .last_modified()
            .and_then(|dt| DateTime::from_timestamp(dt.secs(), dt.subsec_nanos()))
            .unwrap_or_else(Utc::now);

        // Extract metadata from headers
        let mut metadata = HashMap::new();
        if let Some(meta) = response.metadata() {
            for (k, v) in meta {
                metadata.insert(k.clone(), v.clone());
            }
        }

        let object_metadata = ObjectMetadata {
            key: key.to_string(),
            size,
            last_modified,
            content_type,
            etag,
            metadata,
        };

        debug!("Retrieved metadata for object: {}", key);
        Ok(object_metadata)
    }

    /// Generate a presigned URL
    pub async fn generate_presigned_url(
        &self,
        key: &str,
        method: &str,
        expires_in: u64,
    ) -> Result<PreSignedUrlResponse, StorageError> {
        debug!("Generating presigned URL for object: {} (method: {})", key, method);

        let expires_at = Utc::now() + chrono::Duration::seconds(expires_in as i64);

        let presigned_url = match method.to_uppercase().as_str() {
            "GET" => {
                let presigning_config = PresigningConfig::expires_in(Duration::from_secs(expires_in))
                    .map_err(|e| StorageError::OperationFailed(format!("Invalid presigning config: {}", e)))?;

                self.client
                    .get_object()
                    .bucket(&self.bucket_name)
                    .key(key)
                    .presigned(presigning_config)
                    .await
                    .map_err(|e| StorageError::OperationFailed(format!("Failed to generate presigned GET URL: {}", e)))?
                    .uri()
                    .to_string()
            }
            "PUT" => {
                let presigning_config = PresigningConfig::expires_in(Duration::from_secs(expires_in))
                    .map_err(|e| StorageError::OperationFailed(format!("Invalid presigning config: {}", e)))?;

                self.client
                    .put_object()
                    .bucket(&self.bucket_name)
                    .key(key)
                    .presigned(presigning_config)
                    .await
                    .map_err(|e| StorageError::OperationFailed(format!("Failed to generate presigned PUT URL: {}", e)))?
                    .uri()
                    .to_string()
            }
            _ => {
                return Err(StorageError::InvalidConfiguration(format!(
                    "Unsupported HTTP method for presigned URL: {}",
                    method
                )));
            }
        };

        info!("Generated presigned URL for object: {}", key);
        Ok(PreSignedUrlResponse {
            url: presigned_url,
            expires_at,
        })
    }

    /// Delete multiple objects
    pub async fn delete_objects(&self, keys: Vec<String>) -> Result<(), StorageError> {
        debug!("Deleting {} objects", keys.len());

        if keys.is_empty() {
            return Ok(());
        }

        // AWS S3 supports batch delete up to 1000 objects
        const BATCH_SIZE: usize = 1000;

        for chunk in keys.chunks(BATCH_SIZE) {
            let objects_to_delete: Vec<_> = chunk
                .iter()
                .map(|key| {
                    aws_sdk_s3::types::ObjectIdentifier::builder()
                        .key(key)
                        .build()
                        .expect("Failed to build ObjectIdentifier")
                })
                .collect();

            let delete_request = aws_sdk_s3::types::Delete::builder()
                .set_objects(Some(objects_to_delete))
                .build()
                .expect("Failed to build Delete request");

            let response = self
                .client
                .delete_objects()
                .bucket(&self.bucket_name)
                .delete(delete_request)
                .send()
                .await
                .map_err(|e| self.map_s3_error(e, "delete_objects"))?;

            // Check for errors in the response
            let errors = response.errors();
            if !errors.is_empty() {
                let error_messages: Vec<String> = errors
                    .iter()
                    .map(|e| format!("Key: {}, Code: {}, Message: {}",
                                   e.key().unwrap_or("unknown"),
                                   e.code().unwrap_or("unknown"),
                                   e.message().unwrap_or("unknown")))
                    .collect();

                return Err(StorageError::OperationFailed(format!(
                    "Some objects failed to delete: {}",
                    error_messages.join("; ")
                )));
            }
        }

        info!("Successfully deleted {} objects", keys.len());
        Ok(())
    }

    /// Upload a local file with progress reporting. Uses multipart upload for files >= 5 MiB.
    /// Returns the upload_id if multipart upload was used, None otherwise.
    pub async fn upload_file_with_progress(
        &self,
        key: &str,
        path: &str,
        content_type: Option<&str>,
        window: &tauri::Window,
        task_id: &str,
    ) -> Result<Option<String>, StorageError> {
        let meta = tokio::fs::metadata(path)
            .await
            .map_err(|e| StorageError::OperationFailed(format!("Failed to stat file: {}", e)))?;
        let total = meta.len();

        // Helper to emit progress
        let emit_progress = |uploaded: u64| {
            let _ = window.emit(
                "upload_progress",
                serde_json::json!({
                    "task_id": task_id,
                    "uploaded": uploaded,
                    "total": total,
                    "progress": if total > 0 { (uploaded as f64) * 100.0 / (total as f64) } else { 0.0 }
                }),
            );
        };

        if total < 5 * 1024 * 1024 {
            // Small file: simple put
            let data = tokio::fs::read(path)
                .await
                .map_err(|e| StorageError::OperationFailed(format!("Failed to read file: {}", e)))?;
            self.put_object(key, Bytes::from(data), content_type).await?;
            emit_progress(total);
            return Ok(None); // No multipart upload for small files
        }

        // Multipart upload for large files
        debug!("Starting multipart upload for {} ({} bytes)", key, total);
        let mut create = self
            .client
            .create_multipart_upload()
            .bucket(&self.bucket_name)
            .key(key);
        if let Some(ct) = content_type { create = create.content_type(ct); }
        let create_resp = create
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "create_multipart_upload"))?;
        let upload_id = create_resp
            .upload_id()
            .ok_or_else(|| StorageError::OperationFailed("Missing upload_id".to_string()))?
            .to_string();

        debug!("Created multipart upload with ID: {}", upload_id);

        let mut file = tokio::fs::File::open(path)
            .await
            .map_err(|e| StorageError::OperationFailed(format!("Failed to open file: {}", e)))?;
        let mut part_number: i32 = 1;
        let mut uploaded: u64 = 0;
        let mut completed_parts: Vec<aws_sdk_s3::types::CompletedPart> = Vec::new();
        const CHUNK: usize = 8 * 1024 * 1024; // 8 MiB

        loop {
            let mut buf = vec![0u8; CHUNK];
            // Read up to CHUNK bytes, filling the buffer as much as possible
            let mut total_read = 0;
            while total_read < CHUNK {
                let n = file
                    .read(&mut buf[total_read..])
                    .await
                    .map_err(|e| StorageError::OperationFailed(format!("Failed to read file: {}", e)))?;
                if n == 0 {
                    break; // EOF
                }
                total_read += n;
            }

            if total_read == 0 {
                break; // No more data
            }

            buf.truncate(total_read);

            let body = ByteStream::from(Bytes::from(buf));
            debug!("Uploading part {} ({} bytes)", part_number, total_read);
            let resp = self
                .client
                .upload_part()
                .bucket(&self.bucket_name)
                .key(key)
                .upload_id(&upload_id)
                .part_number(part_number)
                .body(body)
                .send()
                .await
                .map_err(|e| self.map_s3_error(e, "upload_part"))?;
            let etag = resp
                .e_tag()
                .ok_or_else(|| StorageError::OperationFailed("Missing ETag in upload part response".to_string()))?
                .to_string();
            debug!("Part {} uploaded with ETag: {}", part_number, etag);
            completed_parts.push(
                aws_sdk_s3::types::CompletedPart::builder()
                    .e_tag(etag.clone())
                    .part_number(part_number)
                    .build()
            );

            uploaded += total_read as u64;
            emit_progress(uploaded);

            // Emit multipart progress event with completed parts info
            let _ = window.emit(
                "multipart_progress",
                serde_json::json!({
                    "task_id": task_id,
                    "upload_id": &upload_id,
                    "bucket_name": &self.bucket_name,
                    "key": key,
                    "part_number": part_number,
                    "etag": etag,
                    "part_size": total_read,
                    "uploaded": uploaded,
                    "total": total,
                }),
            );

            part_number += 1;
        }

        debug!("Completing multipart upload with {} parts", completed_parts.len());
        let completed_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
            .set_parts(Some(completed_parts))
            .build();
        self.client
            .complete_multipart_upload()
            .bucket(&self.bucket_name)
            .key(key)
            .upload_id(&upload_id)
            .multipart_upload(completed_upload)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "complete_multipart_upload"))?;

        info!("Successfully completed multipart upload for: {}", key);

        Ok(Some(upload_id))
    }
    /// List all objects with a prefix (paginated)
    pub async fn list_all_objects_with_prefix(&self, prefix: &str) -> Result<Vec<S3Object>, StorageError> {
        debug!("Listing all objects with prefix: {}", prefix);

        let mut all_objects = Vec::new();
        let mut continuation_token = None;

        loop {
            let response = self
                .list_objects(
                    Some(prefix.to_string()),
                    Some(1000), // Max per request
                    continuation_token,
                )
                .await?;

            all_objects.extend(response.objects);

            if !response.is_truncated {
                break;
            }

            continuation_token = response.continuation_token;
        }

        info!("Retrieved {} objects with prefix: {}", all_objects.len(), prefix);
        Ok(all_objects)
    }

    /// Map AWS S3 errors to our StorageError type
    fn map_s3_error<E, R>(&self, error: SdkError<E, R>, operation: &str) -> StorageError
    where
        E: std::fmt::Display + ProvideErrorMetadata,
        R: std::fmt::Debug,
    {
        error!("S3 operation '{}' failed: {}", operation, error);

        match &error {
            SdkError::ServiceError(service_error) => {
                let error_code = service_error.err().meta().code().unwrap_or("Unknown");
                let error_message = service_error.err().meta().message().unwrap_or("No message");
                error!("S3 ServiceError - Code: {}, Message: {}", error_code, error_message);

                match error_code {
                    "NoSuchBucket" => StorageError::BucketNotFound(self.bucket_name.clone()),
                    "NoSuchKey" => StorageError::ObjectNotFound("Object not found".to_string()),
                    "InvalidAccessKeyId" | "SignatureDoesNotMatch" => {
                        StorageError::AuthenticationFailed("Invalid credentials".to_string())
                    }
                    "AccessDenied" => StorageError::PermissionDenied("Access denied".to_string()),
                    _ => StorageError::OperationFailed(format!("S3 error [{}]: {}", error_code, error_message)),
                }
            }
            SdkError::TimeoutError(_) => StorageError::NetworkError("Request timeout".to_string()),
            SdkError::ResponseError(response_error) => {
                StorageError::NetworkError(format!("Response error: {:?}", response_error))
            }
            SdkError::DispatchFailure(dispatch_error) => {
                StorageError::NetworkError(format!("Network error: {:?}", dispatch_error))
            }
            _ => StorageError::OperationFailed(format!("S3 operation failed: {}", error)),
        }
    }

    /// List active multipart uploads
    pub async fn list_multipart_uploads(&self) -> Result<Vec<serde_json::Value>, StorageError> {
        debug!("Listing active multipart uploads");

        let response = self
            .client
            .list_multipart_uploads()
            .bucket(&self.bucket_name)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "list_multipart_uploads"))?;

        let mut uploads = Vec::new();
        let upload_list = response.uploads();
        for upload in upload_list {
            uploads.push(serde_json::json!({
                "upload_id": upload.upload_id().unwrap_or(""),
                "key": upload.key().unwrap_or(""),
                "initiated": upload.initiated().map(|dt| dt.to_string()).unwrap_or_default(),
                "storage_class": upload.storage_class().map(|sc| sc.as_str()).unwrap_or(""),
            }));
        }

        debug!("Found {} active multipart uploads", uploads.len());
        Ok(uploads)
    }

    /// Resume a multipart upload from where it left off
    pub async fn resume_multipart_upload(
        &self,
        key: &str,
        path: &str,
        upload_id: &str,
        completed_parts: Vec<(i32, String, u64)>, // (part_number, etag, size)
        window: &tauri::Window,
        task_id: &str,
    ) -> Result<(), StorageError> {
        debug!("Resuming multipart upload: {} ({})", key, upload_id);

        let meta = tokio::fs::metadata(path)
            .await
            .map_err(|e| StorageError::OperationFailed(format!("Failed to get file metadata: {}", e)))?;
        let total = meta.len();

        // Calculate how much has already been uploaded
        let uploaded_so_far: u64 = completed_parts.iter().map(|(_, _, size)| *size).sum();
        let mut uploaded = uploaded_so_far;

        let emit_progress = |uploaded: u64| {
            let _ = window.emit(
                "upload_progress",
                serde_json::json!({
                    "task_id": task_id,
                    "uploaded": uploaded,
                    "total": total,
                    "progress": if total > 0 { (uploaded as f64) * 100.0 / (total as f64) } else { 0.0 }
                }),
            );
        };

        // Emit initial progress
        emit_progress(uploaded);

        // Convert completed parts to AWS SDK format
        let mut aws_completed_parts: Vec<aws_sdk_s3::types::CompletedPart> = completed_parts
            .into_iter()
            .map(|(part_number, etag, _)| {
                aws_sdk_s3::types::CompletedPart::builder()
                    .part_number(part_number)
                    .e_tag(etag)
                    .build()
            })
            .collect();

        // Open file and seek to the position where we need to resume
        let mut file = tokio::fs::File::open(path)
            .await
            .map_err(|e| StorageError::OperationFailed(format!("Failed to open file: {}", e)))?;

        // Seek to the position after the last completed part
        if uploaded_so_far > 0 {
            use tokio::io::AsyncSeekExt;
            file.seek(std::io::SeekFrom::Start(uploaded_so_far))
                .await
                .map_err(|e| StorageError::OperationFailed(format!("Failed to seek in file: {}", e)))?;
        }

        // Continue uploading from where we left off
        let mut part_number = aws_completed_parts.len() as i32 + 1;
        const CHUNK: usize = 8 * 1024 * 1024; // 8 MiB

        loop {
            let mut buffer = vec![0u8; CHUNK];
            // Read up to CHUNK bytes, filling the buffer as much as possible
            let mut total_read = 0;
            while total_read < CHUNK {
                let n = file
                    .read(&mut buffer[total_read..])
                    .await
                    .map_err(|e| StorageError::OperationFailed(format!("Failed to read file: {}", e)))?;
                if n == 0 {
                    break; // EOF
                }
                total_read += n;
            }

            if total_read == 0 {
                break; // No more data
            }

            buffer.truncate(total_read);
            let part_stream = ByteStream::from(Bytes::from(buffer));

            let upload_part_resp = self
                .client
                .upload_part()
                .bucket(&self.bucket_name)
                .key(key)
                .upload_id(upload_id)
                .part_number(part_number)
                .body(part_stream)
                .send()
                .await
                .map_err(|e| self.map_s3_error(e, "upload_part"))?;

            let etag = upload_part_resp
                .e_tag()
                .ok_or_else(|| StorageError::OperationFailed("Missing ETag from upload_part".to_string()))?
                .to_string();

            let completed_part = aws_sdk_s3::types::CompletedPart::builder()
                .part_number(part_number)
                .e_tag(etag)
                .build();

            aws_completed_parts.push(completed_part);
            uploaded += total_read as u64;
            emit_progress(uploaded);
            part_number += 1;
        }

        // Complete the multipart upload
        debug!("Completing resumed multipart upload with {} parts", aws_completed_parts.len());
        let completed_upload = aws_sdk_s3::types::CompletedMultipartUpload::builder()
            .set_parts(Some(aws_completed_parts))
            .build();

        self.client
            .complete_multipart_upload()
            .bucket(&self.bucket_name)
            .key(key)
            .upload_id(upload_id)
            .multipart_upload(completed_upload)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "complete_multipart_upload"))?;

        info!("Successfully completed resumed multipart upload for: {}", key);
        Ok(())
    }

    /// Abort a multipart upload
    pub async fn abort_multipart_upload(&self, key: &str, upload_id: &str) -> Result<(), StorageError> {
        debug!("Aborting multipart upload: {} ({})", key, upload_id);

        self.client
            .abort_multipart_upload()
            .bucket(&self.bucket_name)
            .key(key)
            .upload_id(upload_id)
            .send()
            .await
            .map_err(|e| self.map_s3_error(e, "abort_multipart_upload"))?;

        info!("Successfully aborted multipart upload: {} ({})", key, upload_id);
        Ok(())
    }
}
