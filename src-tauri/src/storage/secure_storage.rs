use crate::security::{EncryptedData, EncryptionService, KeyManager};
use crate::types::StorageError;
use anyhow::{Context, Result};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Secure storage service for encrypting and persisting application data
pub struct SecureStorage {
    storage_path: PathBuf,
    encryption_service: EncryptionService,
}

impl SecureStorage {
    /// Initialize secure storage with RSA encryption
    pub fn new() -> Result<Self, StorageError> {
        let key_manager = KeyManager::new()
            .map_err(|e| StorageError::InvalidConfiguration(format!("Failed to initialize key manager: {}", e)))?;

        let (public_key, private_key) = key_manager.get_or_create_key_pair()
            .map_err(|e| StorageError::InvalidConfiguration(format!("Failed to get RSA key pair: {}", e)))?;

        let encryption_service = EncryptionService::new(public_key, private_key);

        let storage_path = key_manager.get_app_data_directory().join("encrypted_storage.json");

        info!("Secure storage initialized at: {:?}", storage_path);

        Ok(Self {
            storage_path,
            encryption_service,
        })
    }

    /// Save encrypted data to storage
    pub fn save<T: Serialize>(&self, key: &str, data: &T) -> Result<(), StorageError> {
        debug!("Saving encrypted data for key: {}", key);

        // Load existing storage or create new
        let mut storage_data = self.load_storage_file()
            .unwrap_or_else(|_| HashMap::new());

        // Encrypt the data
        let encrypted_data = self.encryption_service.encrypt_json(data)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to encrypt data: {}", e)))?;

        // Store encrypted data
        storage_data.insert(key.to_string(), encrypted_data);

        // Save to file
        self.save_storage_file(&storage_data)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to save storage file: {}", e)))?;

        debug!("Successfully saved encrypted data for key: {}", key);
        Ok(())
    }

    /// Load and decrypt data from storage
    pub fn load<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<T, StorageError> {
        debug!("Loading encrypted data for key: {}", key);

        let storage_data = self.load_storage_file()
            .map_err(|e| StorageError::OperationFailed(format!("Failed to load storage file: {}", e)))?;

        let encrypted_data = storage_data.get(key)
            .ok_or_else(|| StorageError::ObjectNotFound(format!("No data found for key: {}", key)))?;

        let decrypted_data = self.encryption_service.decrypt_json(encrypted_data)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to decrypt data: {}", e)))?;

        debug!("Successfully loaded encrypted data for key: {}", key);
        Ok(decrypted_data)
    }

    /// Remove data from storage
    pub fn remove(&self, key: &str) -> Result<(), StorageError> {
        debug!("Removing data for key: {}", key);

        let mut storage_data = self.load_storage_file()
            .map_err(|e| StorageError::OperationFailed(format!("Failed to load storage file: {}", e)))?;

        let removed = storage_data.remove(key).is_some();

        if removed {
            self.save_storage_file(&storage_data)
                .map_err(|e| StorageError::OperationFailed(format!("Failed to save storage file: {}", e)))?;
            debug!("Successfully removed data for key: {}", key);
        } else {
            warn!("No data found to remove for key: {}", key);
        }

        Ok(())
    }

    /// Check if key exists in storage
    pub fn exists(&self, key: &str) -> bool {
        match self.load_storage_file() {
            Ok(storage_data) => storage_data.contains_key(key),
            Err(_) => false,
        }
    }

    /// List all keys in storage
    pub fn list_keys(&self) -> Result<Vec<String>, StorageError> {
        let storage_data = self.load_storage_file()
            .map_err(|e| StorageError::OperationFailed(format!("Failed to load storage file: {}", e)))?;

        Ok(storage_data.keys().cloned().collect())
    }

    /// Clear all data from storage
    pub fn clear(&self) -> Result<(), StorageError> {
        warn!("Clearing all encrypted storage data");

        let empty_storage: HashMap<String, EncryptedData> = HashMap::new();
        self.save_storage_file(&empty_storage)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to clear storage: {}", e)))?;

        info!("All encrypted storage data cleared");
        Ok(())
    }

    /// Get storage file size in bytes
    pub fn get_storage_size(&self) -> Result<u64, StorageError> {
        if !self.storage_path.exists() {
            return Ok(0);
        }

        let metadata = fs::metadata(&self.storage_path)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to read storage metadata: {}", e)))?;

        Ok(metadata.len())
    }

    /// Load storage data from file
    fn load_storage_file(&self) -> Result<HashMap<String, EncryptedData>> {
        if !self.storage_path.exists() {
            debug!("Storage file does not exist, returning empty storage");
            return Ok(HashMap::new());
        }

        let file_content = fs::read_to_string(&self.storage_path)
            .with_context(|| format!("Failed to read storage file: {:?}", self.storage_path))?;

        if file_content.trim().is_empty() {
            debug!("Storage file is empty, returning empty storage");
            return Ok(HashMap::new());
        }

        let storage_data: HashMap<String, EncryptedData> = serde_json::from_str(&file_content)
            .context("Failed to parse storage file JSON")?;

        debug!("Loaded storage file with {} entries", storage_data.len());
        Ok(storage_data)
    }

    /// Save storage data to file
    fn save_storage_file(&self, storage_data: &HashMap<String, EncryptedData>) -> Result<()> {
        // Ensure the parent directory exists
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create storage directory: {:?}", parent))?;
        }

        let file_content = serde_json::to_string_pretty(storage_data)
            .context("Failed to serialize storage data to JSON")?;

        fs::write(&self.storage_path, file_content)
            .with_context(|| format!("Failed to write storage file: {:?}", self.storage_path))?;

        debug!("Saved storage file with {} entries", storage_data.len());
        Ok(())
    }
}

/// Storage statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_keys: usize,
    pub storage_size_bytes: u64,
    pub storage_path: String,
}

impl SecureStorage {
    /// Get storage statistics
    pub fn get_stats(&self) -> Result<StorageStats, StorageError> {
        let keys = self.list_keys()?;
        let size = self.get_storage_size()?;

        Ok(StorageStats {
            total_keys: keys.len(),
            storage_size_bytes: size,
            storage_path: self.storage_path.to_string_lossy().to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use tempfile::tempdir;

    #[derive(Debug, Serialize, Deserialize, PartialEq)]
    struct TestData {
        username: String,
        password: String,
        settings: HashMap<String, String>,
    }

    fn create_test_storage() -> SecureStorage {
        let temp_dir = tempdir().unwrap();
        let key_manager = KeyManager::new().unwrap();
        let (public_key, private_key) = key_manager.generate_key_pair().unwrap();
        let encryption_service = EncryptionService::new(public_key, private_key);

        SecureStorage {
            storage_path: temp_dir.path().join("test_storage.json"),
            encryption_service,
        }
    }

    #[test]
    fn test_storage_roundtrip() {
        let storage = create_test_storage();

        let test_data = TestData {
            username: "test_user".to_string(),
            password: "super_secret".to_string(),
            settings: [("theme".to_string(), "dark".to_string())]
                .iter()
                .cloned()
                .collect(),
        };

        // Save data
        storage.save("test_session", &test_data).unwrap();

        // Load data
        let loaded_data: TestData = storage.load("test_session").unwrap();

        assert_eq!(test_data, loaded_data);
    }

    #[test]
    fn test_storage_operations() {
        let storage = create_test_storage();

        // Test non-existent key
        assert!(!storage.exists("non_existent"));
        assert!(storage.load::<TestData>("non_existent").is_err());

        // Save some data
        let test_data = TestData {
            username: "user1".to_string(),
            password: "pass1".to_string(),
            settings: HashMap::new(),
        };

        storage.save("session1", &test_data).unwrap();
        assert!(storage.exists("session1"));

        // List keys
        let keys = storage.list_keys().unwrap();
        assert_eq!(keys.len(), 1);
        assert!(keys.contains(&"session1".to_string()));

        // Remove data
        storage.remove("session1").unwrap();
        assert!(!storage.exists("session1"));
        let keys = storage.list_keys().unwrap();
        assert_eq!(keys.len(), 0);
    }

    #[test]
    fn test_storage_clear() {
        let storage = create_test_storage();

        // Add multiple entries
        for i in 0..5 {
            let test_data = TestData {
                username: format!("user{}", i),
                password: format!("pass{}", i),
                settings: HashMap::new(),
            };
            storage.save(&format!("session{}", i), &test_data).unwrap();
        }

        let keys = storage.list_keys().unwrap();
        assert_eq!(keys.len(), 5);

        // Clear all
        storage.clear().unwrap();

        let keys = storage.list_keys().unwrap();
        assert_eq!(keys.len(), 0);
    }
}