use crate::clients::AwsS3Client;
use crate::types::{StorageConfig, S3Object, ListObjectsResponse, StorageError, ObjectMetadata, PreSignedUrlResponse};
use bytes::Bytes;
use log::{debug, info};

/// Unified storage service that uses AWS SDK S3 client for both R2 and S3-compatible storage
pub struct StorageService {
    client: AwsS3Client,
}

impl StorageService {
    /// Create a new storage service based on the configuration
    pub async fn new(config: StorageConfig) -> Result<Self, StorageError> {
        debug!("Creating storage service for config type: {}", config.provider_type());

        let provider_type = config.provider_type();

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
                ).await?
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
                let custom_endpoint = if endpoint.is_empty() || endpoint == "https://s3.amazonaws.com" {
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
                ).await?
            }
        };

        info!("Created {} storage service", provider_type);
        Ok(StorageService {
            client,
        })
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
        self.client.list_objects(prefix, max_keys, continuation_token).await
    }

    /// Get an object from the bucket
    pub async fn get_object(&self, key: &str) -> Result<Bytes, StorageError> {
        self.client.get_object(key).await
    }

    /// Put an object into the bucket
    pub async fn put_object(&self, key: &str, data: Bytes, content_type: Option<&str>) -> Result<(), StorageError> {
        self.client.put_object(key, data, content_type).await
    }

    /// Delete an object from the bucket
    pub async fn delete_object(&self, key: &str) -> Result<(), StorageError> {
        self.client.delete_object(key).await
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
        self.client.generate_presigned_url(key, method, expires_in).await
    }

    /// Delete multiple objects
    pub async fn delete_objects(&self, keys: Vec<String>) -> Result<(), StorageError> {
        self.client.delete_objects(keys).await
    }

    /// List all objects with a given prefix (handles pagination automatically)
    pub async fn list_all_objects_with_prefix(&self, prefix: &str) -> Result<Vec<S3Object>, StorageError> {
        self.client.list_all_objects_with_prefix(prefix).await
    }

    /// Create a folder by uploading a placeholder object
    pub async fn create_folder(&self, prefix: &str) -> Result<(), StorageError> {
        debug!("Creating folder: {}", prefix);

        let folder_key = if prefix.ends_with('/') {
            format!("{}/.folder", prefix.trim_end_matches('/'))
        } else {
            format!("{}/.folder", prefix)
        };

        self.put_object(&folder_key, Bytes::new(), Some("application/x-directory")).await?;

        info!("Created folder: {}", prefix);
        Ok(())
    }

    /// Delete a folder by removing all objects with the given prefix
    pub async fn delete_folder(&self, prefix: &str) -> Result<(), StorageError> {
        debug!("Deleting folder: {}", prefix);

        let objects = self.list_all_objects_with_prefix(prefix).await?;
        if objects.is_empty() {
            info!("No objects found in folder: {}", prefix);
            return Ok(());
        }

        let keys: Vec<String> = objects.into_iter().map(|obj| obj.key).collect();
        let key_count = keys.len();
        self.delete_objects(keys).await?;

        info!("Deleted folder: {} ({} objects)", prefix, key_count);
        Ok(())
    }

    /// Move an object (copy then delete original)
    pub async fn move_object(&self, source_key: &str, dest_key: &str) -> Result<(), StorageError> {
        debug!("Moving object from {} to {}", source_key, dest_key);

        self.copy_object(source_key, dest_key).await?;
        self.delete_object(source_key).await?;

        info!("Moved object from {} to {}", source_key, dest_key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::StorageConfig;

    fn create_test_r2_config() -> StorageConfig {
        StorageConfig::R2 {
            account_id: "test_account".to_string(),
            access_key_id: "test_key".to_string(),
            secret_access_key: "test_secret".to_string(),
            bucket_name: "test_bucket".to_string(),
            session_name: "Test R2".to_string(),
        }
    }

    fn create_test_s3_config() -> StorageConfig {
        StorageConfig::S3 {
            endpoint: "https://s3.amazonaws.com".to_string(),
            region: "us-east-1".to_string(),
            access_key_id: "test_key".to_string(),
            secret_access_key: "test_secret".to_string(),
            bucket_name: "test_bucket".to_string(),
            force_path_style: Some(false),
            session_name: "Test S3".to_string(),
        }
    }

    #[tokio::test]
    async fn test_storage_service_creation_r2() {
        let config = create_test_r2_config();
        let service = StorageService::new(config).await;

        assert!(service.is_ok());
        let service = service.unwrap();
        assert_eq!(service.get_provider_type(), "Cloudflare R2");
        assert!(service.supports_batch_delete());
        assert_eq!(service.max_batch_delete_size(), 1000);
    }

    #[tokio::test]
    async fn test_storage_service_creation_s3() {
        let config = create_test_s3_config();
        let service = StorageService::new(config).await;

        assert!(service.is_ok());
        let service = service.unwrap();
        assert_eq!(service.get_provider_type(), "S3 Compatible");
        assert!(service.supports_batch_delete());
        assert_eq!(service.max_batch_delete_size(), 1000);
    }
}