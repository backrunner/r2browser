use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

/// Storage configuration supporting both Cloudflare R2 and S3-compatible services
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum StorageConfig {
    /// Cloudflare R2 configuration with preset values
    #[serde(rename = "r2")]
    R2 {
        /// Cloudflare account ID (determines the R2 endpoint)
        account_id: String,
        /// R2 Access Key ID
        access_key_id: String,
        /// R2 Secret Access Key
        secret_access_key: String,
        /// R2 bucket name
        bucket_name: String,
        /// User-friendly session name
        session_name: String,
    },
    /// S3-compatible service configuration
    #[serde(rename = "s3")]
    S3 {
        /// S3 endpoint URL (e.g., https://s3.amazonaws.com, https://minio.example.com)
        endpoint: String,
        /// AWS region or equivalent
        region: String,
        /// Access Key ID
        access_key_id: String,
        /// Secret Access Key
        secret_access_key: String,
        /// Bucket name
        bucket_name: String,
        /// User-friendly session name
        session_name: String,
        /// Force path-style URLs (needed for some S3-compatible services)
        force_path_style: Option<bool>,
    },
}

impl StorageConfig {
    /// Get the session name for this configuration
    pub fn session_name(&self) -> &str {
        match self {
            StorageConfig::R2 { session_name, .. } => session_name,
            StorageConfig::S3 { session_name, .. } => session_name,
        }
    }

    /// Get the bucket name for this configuration
    pub fn bucket_name(&self) -> &str {
        match self {
            StorageConfig::R2 { bucket_name, .. } => bucket_name,
            StorageConfig::S3 { bucket_name, .. } => bucket_name,
        }
    }

    /// Get the access key ID for this configuration
    pub fn access_key_id(&self) -> &str {
        match self {
            StorageConfig::R2 { access_key_id, .. } => access_key_id,
            StorageConfig::S3 { access_key_id, .. } => access_key_id,
        }
    }

    /// Get the secret access key for this configuration
    pub fn secret_access_key(&self) -> &str {
        match self {
            StorageConfig::R2 { secret_access_key, .. } => secret_access_key,
            StorageConfig::S3 { secret_access_key, .. } => secret_access_key,
        }
    }

    /// Get the provider type as a string
    pub fn provider_type(&self) -> &'static str {
        match self {
            StorageConfig::R2 { .. } => "Cloudflare R2",
            StorageConfig::S3 { .. } => "S3 Compatible",
        }
    }

    /// Get the effective endpoint URL for AWS SDK
    pub fn get_endpoint_url(&self) -> Option<String> {
        match self {
            StorageConfig::R2 { account_id, .. } => {
                Some(format!("https://{}.r2.cloudflarestorage.com", account_id))
            },
            StorageConfig::S3 { endpoint, .. } => {
                // Return None for default AWS endpoints to use AWS SDK defaults
                if endpoint.is_empty() ||
                   endpoint == "https://s3.amazonaws.com" ||
                   endpoint.contains(".amazonaws.com") {
                    None
                } else {
                    Some(endpoint.clone())
                }
            },
        }
    }

    /// Get the region for AWS SDK
    pub fn get_region(&self) -> String {
        match self {
            StorageConfig::R2 { .. } => "auto".to_string(), // R2 uses "auto" region
            StorageConfig::S3 { region, .. } => region.clone(),
        }
    }

    /// Check if path-style URLs should be forced
    pub fn force_path_style(&self) -> bool {
        match self {
            StorageConfig::R2 { .. } => false, // R2 supports virtual-hosted-style
            StorageConfig::S3 { force_path_style, .. } => force_path_style.unwrap_or(false),
        }
    }
}

/// S3 object representation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct S3Object {
    pub key: String,
    pub size: i64,
    pub last_modified: DateTime<Utc>,
    pub etag: String,
    pub storage_class: Option<String>,
    pub content_type: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

/// Response from list objects operation
#[derive(Debug, Serialize, Deserialize)]
pub struct ListObjectsResponse {
    pub objects: Vec<S3Object>,
    pub common_prefixes: Vec<String>,
    pub continuation_token: Option<String>,
    pub is_truncated: bool,
    pub prefix: Option<String>,
}

/// Upload progress information
#[derive(Debug, Serialize, Deserialize)]
pub struct UploadProgress {
    pub uploaded: u64,
    pub total: u64,
    pub percentage: f64,
}

/// Presigned URL request parameters
#[derive(Debug, Serialize, Deserialize)]
pub struct PreSignedUrlRequest {
    pub key: String,
    pub expires_in: u64, // seconds
    pub method: String,  // GET, PUT, etc.
}

/// Presigned URL response
#[derive(Debug, Serialize, Deserialize)]
pub struct PreSignedUrlResponse {
    pub url: String,
    pub expires_at: DateTime<Utc>,
}

/// Folder creation request
#[derive(Debug, Serialize, Deserialize)]
pub struct FolderCreateRequest {
    pub prefix: String,
}

/// Object metadata
#[derive(Debug, Serialize, Deserialize)]
pub struct ObjectMetadata {
    pub key: String,
    pub size: i64,
    pub last_modified: DateTime<Utc>,
    pub content_type: Option<String>,
    pub etag: String,
    pub metadata: HashMap<String, String>,
}

/// Storage operation errors
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Object not found: {0}")]
    ObjectNotFound(String),

    #[error("Bucket not found: {0}")]
    BucketNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),

    #[error("Upload failed: {0}")]
    UploadFailed(String),

    #[error("Download failed: {0}")]
    DownloadFailed(String),

    #[error("Operation failed: {0}")]
    OperationFailed(String),
}

impl From<reqwest::Error> for StorageError {
    fn from(err: reqwest::Error) -> Self {
        StorageError::NetworkError(err.to_string())
    }
}

impl Serialize for StorageError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Helper functions for creating R2 configurations
impl StorageConfig {
    /// Create a new R2 configuration with preset values
    pub fn new_r2(
        account_id: String,
        access_key_id: String,
        secret_access_key: String,
        bucket_name: String,
        session_name: Option<String>,
    ) -> Self {
        let session_name = session_name.unwrap_or_else(|| {
            format!("R2: {}/{}", account_id, bucket_name)
        });

        StorageConfig::R2 {
            account_id,
            access_key_id,
            secret_access_key,
            bucket_name,
            session_name,
        }
    }

    /// Create a new S3 configuration
    pub fn new_s3(
        endpoint: String,
        region: String,
        access_key_id: String,
        secret_access_key: String,
        bucket_name: String,
        session_name: Option<String>,
        force_path_style: Option<bool>,
    ) -> Self {
        let session_name = session_name.unwrap_or_else(|| {
            let host = endpoint
                .strip_prefix("https://")
                .or_else(|| endpoint.strip_prefix("http://"))
                .unwrap_or(&endpoint);
            format!("S3: {}/{}", host, bucket_name)
        });

        StorageConfig::S3 {
            endpoint,
            region,
            access_key_id,
            secret_access_key,
            bucket_name,
            session_name,
            force_path_style,
        }
    }

    /// Create a quick R2 configuration with minimal input
    pub fn quick_r2(account_id: &str, bucket_name: &str, access_key_id: &str, secret_access_key: &str) -> Self {
        Self::new_r2(
            account_id.to_string(),
            access_key_id.to_string(),
            secret_access_key.to_string(),
            bucket_name.to_string(),
            None, // Auto-generate session name
        )
    }

    /// Create a quick AWS S3 configuration
    pub fn quick_aws_s3(region: &str, bucket_name: &str, access_key_id: &str, secret_access_key: &str) -> Self {
        Self::new_s3(
            "https://s3.amazonaws.com".to_string(),
            region.to_string(),
            access_key_id.to_string(),
            secret_access_key.to_string(),
            bucket_name.to_string(),
            None, // Auto-generate session name
            Some(false), // AWS doesn't need path-style
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_r2_config_creation() {
        let config = StorageConfig::quick_r2("test_account", "test_bucket", "key", "secret");

        match config {
            StorageConfig::R2 { account_id, bucket_name, .. } => {
                assert_eq!(account_id, "test_account");
                assert_eq!(bucket_name, "test_bucket");
            }
            _ => panic!("Expected R2 config"),
        }

        assert_eq!(config.provider_type(), "Cloudflare R2");
        assert_eq!(config.get_region(), "auto");
        assert_eq!(
            config.get_endpoint_url().unwrap(),
            "https://test_account.r2.cloudflarestorage.com"
        );
        assert!(!config.force_path_style());
    }

    #[test]
    fn test_s3_config_creation() {
        let config = StorageConfig::quick_aws_s3("us-east-1", "test_bucket", "key", "secret");

        match config {
            StorageConfig::S3 { region, bucket_name, .. } => {
                assert_eq!(region, "us-east-1");
                assert_eq!(bucket_name, "test_bucket");
            }
            _ => panic!("Expected S3 config"),
        }

        assert_eq!(config.provider_type(), "S3 Compatible");
        assert_eq!(config.get_region(), "us-east-1");
        assert!(config.get_endpoint_url().is_none()); // Should use AWS default
        assert!(!config.force_path_style());
    }

    #[test]
    fn test_custom_s3_endpoint() {
        let config = StorageConfig::new_s3(
            "https://minio.example.com".to_string(),
            "us-east-1".to_string(),
            "key".to_string(),
            "secret".to_string(),
            "bucket".to_string(),
            None,
            Some(true),
        );

        assert_eq!(
            config.get_endpoint_url().unwrap(),
            "https://minio.example.com"
        );
        assert!(config.force_path_style());
    }
}