use aws_config::BehaviorVersion;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::Client;
use aws_sdk_s3::types::{CorsConfiguration, CorsRule as S3CorsRule};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInfo {
    pub name: String,
    pub creation_date: String,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListBucketsResponse {
    pub buckets: Vec<BucketInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsRule {
    pub id: Option<String>,
    pub allowed_origins: Vec<String>,
    pub allowed_methods: Vec<String>,
    pub allowed_headers: Vec<String>,
    pub exposed_headers: Option<Vec<String>>,
    pub max_age_seconds: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketCorsConfig {
    pub cors_rules: Vec<CorsRule>,
}

pub struct CloudflareR2Client {
    client: Client,
}

impl CloudflareR2Client {
    pub async fn new(
        account_id: &str,
        access_key_id: &str,
        secret_access_key: &str,
    ) -> Result<Self, String> {
        let credentials = Credentials::new(
            access_key_id,
            secret_access_key,
            None,
            None,
            "r2-browser",
        );

        let endpoint_url = format!("https://{}.r2.cloudflarestorage.com", account_id);

        let config = aws_sdk_s3::Config::builder()
            .behavior_version(BehaviorVersion::latest())
            .credentials_provider(credentials)
            .region(Region::new("auto"))
            .endpoint_url(&endpoint_url)
            .force_path_style(false)
            .build();

        let client = Client::from_conf(config);

        Ok(Self { client })
    }

    pub async fn list_buckets(&self) -> Result<ListBucketsResponse, String> {
        let response = self
            .client
            .list_buckets()
            .send()
            .await
            .map_err(|e| format!("Failed to list buckets: {}", e))?;

        let buckets = response
            .buckets()
            .iter()
            .map(|bucket| BucketInfo {
                name: bucket.name().unwrap_or("").to_string(),
                creation_date: bucket
                    .creation_date()
                    .map(|d| d.to_string())
                    .unwrap_or_default(),
                location: None,
            })
            .collect();

        Ok(ListBucketsResponse { buckets })
    }

    pub async fn get_bucket_cors(&self, bucket_name: &str) -> Result<BucketCorsConfig, String> {
        let response = self
            .client
            .get_bucket_cors()
            .bucket(bucket_name)
            .send()
            .await
            .map_err(|e| format!("Failed to get bucket CORS: {}", e))?;

        let cors_rules = response
            .cors_rules()
            .iter()
            .map(|rule| {
                let allowed_headers: Vec<String> = rule.allowed_headers()
                    .iter()
                    .map(|s| s.to_string())
                    .collect();

                let exposed_headers: Option<Vec<String>> = if !rule.expose_headers().is_empty() {
                    Some(rule.expose_headers().iter().map(|s| s.to_string()).collect())
                } else {
                    None
                };

                CorsRule {
                    id: rule.id().map(|s| s.to_string()),
                    allowed_origins: rule.allowed_origins().iter().map(|s| s.to_string()).collect(),
                    allowed_methods: rule.allowed_methods().iter().map(|s| s.to_string()).collect(),
                    allowed_headers,
                    exposed_headers,
                    max_age_seconds: rule.max_age_seconds(),
                }
            })
            .collect();

        Ok(BucketCorsConfig { cors_rules })
    }

    pub async fn update_bucket_cors(
        &self,
        bucket_name: &str,
        cors_config: BucketCorsConfig,
    ) -> Result<(), String> {
        let cors_rules: Vec<S3CorsRule> = cors_config
            .cors_rules
            .iter()
            .map(|rule| {
                let mut builder = S3CorsRule::builder()
                    .set_id(rule.id.clone())
                    .set_allowed_origins(Some(rule.allowed_origins.clone()))
                    .set_allowed_methods(Some(rule.allowed_methods.clone()))
                    .set_allowed_headers(Some(rule.allowed_headers.clone()));

                if let Some(exposed_headers) = &rule.exposed_headers {
                    builder = builder.set_expose_headers(Some(exposed_headers.clone()));
                }

                if let Some(max_age) = rule.max_age_seconds {
                    builder = builder.max_age_seconds(max_age);
                }

                builder.build()
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to build CORS rules: {}", e))?;

        let cors_configuration = CorsConfiguration::builder()
            .set_cors_rules(Some(cors_rules))
            .build()
            .map_err(|e| format!("Failed to build CORS configuration: {}", e))?;

        self.client
            .put_bucket_cors()
            .bucket(bucket_name)
            .cors_configuration(cors_configuration)
            .send()
            .await
            .map_err(|e| format!("Failed to update bucket CORS: {}", e))?;

        Ok(())
    }

    pub async fn delete_bucket(&self, bucket_name: &str) -> Result<(), String> {
        self.client
            .delete_bucket()
            .bucket(bucket_name)
            .send()
            .await
            .map_err(|e| format!("Failed to delete bucket: {}", e))?;

        Ok(())
    }

    pub async fn check_bucket_empty(&self, bucket_name: &str) -> Result<bool, String> {
        let response = self
            .client
            .list_objects_v2()
            .bucket(bucket_name)
            .max_keys(1)
            .send()
            .await
            .map_err(|e| format!("Failed to check bucket contents: {}", e))?;

        Ok(response.contents().is_empty())
    }
}
