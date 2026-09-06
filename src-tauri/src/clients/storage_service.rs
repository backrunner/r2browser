use crate::clients::AwsS3Client;
use crate::types::{
    ListObjectsResponse, ObjectMetadata, PreSignedUrlResponse, S3Object, StorageConfig,
    StorageError,
};
use bytes::Bytes;
use tracing::{debug, info};

/// Unified storage service that uses AWS SDK S3 client for both R2 and S3-compatible storage
#[derive(Clone)]
pub struct StorageService {
    client: AwsS3Client,
}

impl StorageService {
    /// Create a new storage service based on the configuration
    pub async fn new(config: StorageConfig) -> Result<Self, StorageError> {
        debug!(
            "Creating storage service for config type: {}",
            config.provider_type()
        );

        // Use AWS SDK S3 client for both R2 and S3-compatible storage
        let client = match config {
            StorageConfig::R2 {
                account_id,
                access_key_id,
                secret_access_key,
                bucket_name,
                ..
            } => {
                // R2 uses preset configurations with AWS SDK S3 client
                let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);
                AwsS3Client::new(
                    Some(endpoint),
                    "auto".to_string(), // R2 uses "auto" region
                    access_key_id,
                    secret_access_key,
                    bucket_name,
                    Some(false), // R2 supports virtual-hosted-style
                )
                .await?
            }
            StorageConfig::S3 {
                endpoint,
                region,
                access_key_id,
                secret_access_key,
                bucket_name,
                force_path_style,
                ..
            } => {
                // Determine if we should use custom endpoint
                let custom_endpoint =
                    if endpoint.is_empty() || endpoint == "https://s3.amazonaws.com" {
                        None
                    } else {
                        Some(endpoint)
                    };

                AwsS3Client::new(
                    custom_endpoint,
                    region,
                    access_key_id,
                    secret_access_key,
                    bucket_name,
                    force_path_style,
                )
                .await?
            }
        };

        info!("Created storage service");
        Ok(StorageService { client })
    }

    /// Test connection to the storage service
    pub async fn test_connection(&self) -> Result<(), StorageError> {
        self.client.test_connection().await
    }

    /// List objects in the bucket with optional prefix filtering
    pub async fn list_objects(
        &self,
        prefix: Option<String>,
        max_keys: Option<i32>,
        continuation_token: Option<String>,
    ) -> Result<ListObjectsResponse, StorageError> {
        self.client
            .list_objects(prefix, max_keys, continuation_token)
            .await
    }

    /// Get an object from the bucket
    pub async fn get_object(&self, key: &str) -> Result<Bytes, StorageError> {
        self.client.get_object(key).await
    }

    /// Put an object into the bucket
    pub async fn put_object(
        &self,
        key: &str,
        data: Bytes,
        content_type: Option<&str>,
    ) -> Result<(), StorageError> {
        self.client.put_object(key, data, content_type).await
    }

    /// Delete an object from the bucket
    pub async fn delete_object(&self, key: &str) -> Result<(), StorageError> {
        self.client.delete_object(key).await
    }

    /// Check whether an object exists.
    pub async fn object_exists(&self, key: &str) -> Result<bool, StorageError> {
        self.client.object_exists(key).await
    }

    /// Copy an object within the bucket
    pub async fn copy_object(&self, source_key: &str, dest_key: &str) -> Result<(), StorageError> {
        self.client.copy_object(source_key, dest_key).await
    }

    /// Get object metadata
    pub async fn get_object_metadata(&self, key: &str) -> Result<ObjectMetadata, StorageError> {
        self.client.get_object_metadata(key).await
    }

    /// Generate a presigned URL for an object
    pub async fn generate_presigned_url(
        &self,
        key: &str,
        method: &str,
        expires_in: u64,
    ) -> Result<PreSignedUrlResponse, StorageError> {
        self.client
            .generate_presigned_url(key, method, expires_in)
            .await
    }

    /// Delete multiple objects
    pub async fn delete_objects(&self, keys: Vec<String>) -> Result<(), StorageError> {
        self.client.delete_objects(keys).await
    }

    /// List all objects with a given prefix (handles pagination automatically)
    pub async fn list_all_objects_with_prefix(
        &self,
        prefix: &str,
    ) -> Result<Vec<S3Object>, StorageError> {
        self.client.list_all_objects_with_prefix(prefix).await
    }

    /// Create a folder by uploading a placeholder object
    pub async fn create_folder(&self, prefix: &str) -> Result<(), StorageError> {
        debug!("Creating folder");

        let folder_key = if prefix.ends_with('/') {
            format!("{}/.folder", prefix.trim_end_matches('/'))
        } else {
            format!("{}/.folder", prefix)
        };

        self.put_object(&folder_key, Bytes::new(), Some("application/x-directory"))
            .await?;

        info!("Created folder");
        Ok(())
    }

    /// Delete a folder by removing all objects with the given prefix
    pub async fn delete_folder(&self, prefix: &str) -> Result<(), StorageError> {
        debug!("Deleting folder");

        let objects = self.list_all_objects_with_prefix(prefix).await?;
        if objects.is_empty() {
            info!("No objects found in folder");
            return Ok(());
        }

        let keys: Vec<String> = objects.into_iter().map(|obj| obj.key).collect();
        let key_count = keys.len();
        self.delete_objects(keys).await?;

        info!(count = key_count, "Deleted folder contents");
        Ok(())
    }

    /// Move an object (copy then delete original)
    pub async fn move_object(&self, source_key: &str, dest_key: &str) -> Result<(), StorageError> {
        debug!("Moving object");

        self.copy_object(source_key, dest_key).await?;
        self.delete_object(source_key).await?;

        info!("Moved object");
        Ok(())
    }

    /// Upload local file with progress (uses multipart for large files)
    /// Returns the upload_id if multipart upload was used, None otherwise
    pub async fn upload_file_with_progress(
        &self,
        key: &str,
        path: &str,
        content_type: Option<&str>,
        window: &tauri::Window,
        task_id: &str,
        transfer_generation: u64,
    ) -> Result<Option<String>, StorageError> {
        self.client
            .upload_file_with_progress(
                key,
                path,
                content_type,
                window,
                task_id,
                transfer_generation,
            )
            .await
    }

    /// Download file with progress reporting and resume capability
    pub async fn download_file_with_progress(
        &self,
        key: &str,
        save_path: &str,
        window: &tauri::Window,
        task_id: &str,
        transfer_generation: u64,
        resume_from: Option<u64>,
    ) -> Result<(), StorageError> {
        self.client
            .download_file_with_progress(
                key,
                save_path,
                window,
                task_id,
                transfer_generation,
                resume_from,
            )
            .await
    }

    /// List active multipart uploads
    pub async fn list_multipart_uploads(&self) -> Result<Vec<serde_json::Value>, StorageError> {
        self.client.list_multipart_uploads().await
    }

    /// Resume a multipart upload
    pub async fn resume_multipart_upload(
        &self,
        key: &str,
        path: &str,
        upload_id: &str,
        completed_parts: Vec<(i32, String, u64)>,
        window: &tauri::Window,
        task_id: &str,
        transfer_generation: u64,
    ) -> Result<(), StorageError> {
        self.client
            .resume_multipart_upload(
                key,
                path,
                upload_id,
                completed_parts,
                window,
                task_id,
                transfer_generation,
            )
            .await
    }

    /// Abort a multipart upload
    pub async fn abort_multipart_upload(
        &self,
        key: &str,
        upload_id: &str,
    ) -> Result<(), StorageError> {
        self.client.abort_multipart_upload(key, upload_id).await
    }
}
