use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
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
        /// Force path-style URLs (needed for some S3-compatible services)
        force_path_style: Option<bool>,
    },
}

impl StorageConfig {
    /// Get the provider type as a string
    pub fn provider_type(&self) -> &'static str {
        match self {
            StorageConfig::R2 { .. } => "Cloudflare R2",
            StorageConfig::S3 { .. } => "S3 Compatible",
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

/// Presigned URL response
#[derive(Debug, Serialize, Deserialize)]
pub struct PreSignedUrlResponse {
    pub url: String,
    pub expires_at: DateTime<Utc>,
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
