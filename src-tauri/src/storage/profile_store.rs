use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::result::Result as StdResult;

use crate::storage::SecureStorage;
use crate::types::StorageError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflareProfile {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub created_at: String,
    pub last_used: String,
}

/// Profile store for managing Cloudflare R2 profiles
#[derive(Clone)]
pub struct ProfileStore {
    secure_storage: SecureStorage,
}

const PROFILES_KEY: &str = "cloudflare_profiles";

impl ProfileStore {
    pub fn new() -> StdResult<Self, StorageError> {
        let secure_storage = SecureStorage::new()?;
        Ok(Self { secure_storage })
    }

    fn load_profiles_map(&self) -> StdResult<HashMap<String, CloudflareProfile>, StorageError> {
        self.secure_storage
            .load::<HashMap<String, CloudflareProfile>>(PROFILES_KEY)
            .or_else(|_| Ok(HashMap::new()))
    }

    fn save_profiles_map(
        &self,
        profiles: &HashMap<String, CloudflareProfile>,
    ) -> StdResult<(), StorageError> {
        self.secure_storage.save(PROFILES_KEY, profiles)
    }

    pub fn get_profiles(&self) -> HashMap<String, CloudflareProfile> {
        self.load_profiles_map().unwrap_or_default()
    }

    pub fn create_profile(
        &self,
        name: String,
        account_id: String,
        access_key_id: String,
        secret_access_key: String,
    ) -> StdResult<String, StorageError> {
        let profile_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let profile = CloudflareProfile {
            id: profile_id.clone(),
            name,
            account_id,
            access_key_id,
            secret_access_key,
            created_at: now.clone(),
            last_used: now,
        };

        let mut profiles = self.load_profiles_map()?;
        profiles.insert(profile_id.clone(), profile);
        self.save_profiles_map(&profiles)?;

        Ok(profile_id)
    }

    pub fn update_profile(
        &self,
        profile_id: &str,
        name: Option<String>,
        account_id: Option<String>,
        access_key_id: Option<String>,
        secret_access_key: Option<String>,
    ) -> StdResult<(), StorageError> {
        let mut profiles = self.load_profiles_map()?;

        let profile = profiles.get_mut(profile_id).ok_or_else(|| {
            StorageError::InvalidConfiguration(format!("Profile not found: {}", profile_id))
        })?;

        if let Some(name) = name {
            profile.name = name;
        }
        if let Some(account_id) = account_id {
            profile.account_id = account_id;
        }
        if let Some(access_key_id) = access_key_id {
            profile.access_key_id = access_key_id;
        }
        if let Some(secret_access_key) = secret_access_key {
            profile.secret_access_key = secret_access_key;
        }

        profile.last_used = Utc::now().to_rfc3339();

        self.save_profiles_map(&profiles)?;

        Ok(())
    }

    pub fn delete_profile(&self, profile_id: &str) -> StdResult<(), StorageError> {
        let mut profiles = self.load_profiles_map()?;

        if profiles.remove(profile_id).is_none() {
            return Err(StorageError::InvalidConfiguration(format!(
                "Profile not found: {}",
                profile_id
            )));
        }

        self.save_profiles_map(&profiles)?;

        Ok(())
    }
}
