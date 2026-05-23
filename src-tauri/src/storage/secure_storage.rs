use crate::security::{EncryptedData, EncryptionService, KeyManager};
use crate::types::StorageError;
// Avoid colliding with std::result::Result in public signatures
use anyhow::{Context, Result as AnyResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tracing::{debug, info, warn};

static STORAGE_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn storage_file_lock() -> &'static Mutex<()> {
    STORAGE_FILE_LOCK.get_or_init(|| Mutex::new(()))
}

/// Secure storage service for encrypting and persisting application data
#[derive(Clone)]
pub struct SecureStorage {
    storage_path: PathBuf,
    encryption_service: EncryptionService,
}

impl SecureStorage {
    /// Initialize secure storage with RSA encryption
    pub fn new() -> std::result::Result<Self, StorageError> {
        let key_manager = KeyManager::new().map_err(|e| {
            StorageError::InvalidConfiguration(format!("Failed to initialize key manager: {}", e))
        })?;

        let (public_key, private_key) = key_manager.get_or_create_key_pair().map_err(|e| {
            StorageError::InvalidConfiguration(format!("Failed to get RSA key pair: {}", e))
        })?;

        let encryption_service = EncryptionService::new(public_key, private_key);

        let storage_path = key_manager
            .get_app_data_directory()
            .join("encrypted_storage.json");

        info!("Secure storage initialized at: {:?}", storage_path);

        Ok(Self {
            storage_path,
            encryption_service,
        })
    }

    /// Save encrypted data to storage
    pub fn save<T: Serialize>(&self, key: &str, data: &T) -> std::result::Result<(), StorageError> {
        debug!("Saving encrypted data for key: {}", key);

        let _guard = storage_file_lock()
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        // Load existing storage or create new
        let mut storage_data = self.load_storage_file().unwrap_or_else(|_| HashMap::new());

        // Encrypt the data
        let encrypted_data = self
            .encryption_service
            .encrypt_json(data)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to encrypt data: {}", e)))?;

        // Store encrypted data
        storage_data.insert(key.to_string(), encrypted_data);

        // Save to file
        self.save_storage_file(&storage_data).map_err(|e| {
            StorageError::OperationFailed(format!("Failed to save storage file: {}", e))
        })?;

        debug!("Successfully saved encrypted data for key: {}", key);
        Ok(())
    }

    /// Load and decrypt data from storage
    pub fn load<T: for<'de> Deserialize<'de>>(
        &self,
        key: &str,
    ) -> std::result::Result<T, StorageError> {
        debug!("Loading encrypted data for key: {}", key);

        let _guard = storage_file_lock()
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        let storage_data = self.load_storage_file().map_err(|e| {
            StorageError::OperationFailed(format!("Failed to load storage file: {}", e))
        })?;

        let encrypted_data = storage_data.get(key).ok_or_else(|| {
            StorageError::ObjectNotFound(format!("No data found for key: {}", key))
        })?;

        let decrypted_data = self
            .encryption_service
            .decrypt_json(encrypted_data)
            .map_err(|e| StorageError::OperationFailed(format!("Failed to decrypt data: {}", e)))?;

        debug!("Successfully loaded encrypted data for key: {}", key);
        Ok(decrypted_data)
    }

    /// Remove data from storage
    pub fn remove(&self, key: &str) -> std::result::Result<(), StorageError> {
        debug!("Removing data for key: {}", key);

        let _guard = storage_file_lock()
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        let mut storage_data = self.load_storage_file().map_err(|e| {
            StorageError::OperationFailed(format!("Failed to load storage file: {}", e))
        })?;

        let removed = storage_data.remove(key).is_some();

        if removed {
            self.save_storage_file(&storage_data).map_err(|e| {
                StorageError::OperationFailed(format!("Failed to save storage file: {}", e))
            })?;
            debug!("Successfully removed data for key: {}", key);
        } else {
            warn!("No data found to remove for key: {}", key);
        }

        Ok(())
    }

    /// Atomically read, update, and save a single encrypted entry.
    pub fn update<T, R, F>(&self, key: &str, updater: F) -> std::result::Result<R, StorageError>
    where
        T: Serialize + for<'de> Deserialize<'de>,
        F: FnOnce(Option<T>) -> std::result::Result<(Option<T>, R), StorageError>,
    {
        debug!("Updating encrypted data for key: {}", key);

        let _guard = storage_file_lock()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let mut storage_data = self.load_storage_file().unwrap_or_else(|_| HashMap::new());

        let current = match storage_data.get(key) {
            Some(encrypted_data) => Some(
                self.encryption_service
                    .decrypt_json(encrypted_data)
                    .map_err(|e| {
                        StorageError::OperationFailed(format!("Failed to decrypt data: {}", e))
                    })?,
            ),
            None => None,
        };

        let (updated, result) = updater(current)?;

        if let Some(data) = updated {
            let encrypted_data = self.encryption_service.encrypt_json(&data).map_err(|e| {
                StorageError::OperationFailed(format!("Failed to encrypt data: {}", e))
            })?;
            storage_data.insert(key.to_string(), encrypted_data);
        } else {
            storage_data.remove(key);
        }

        self.save_storage_file(&storage_data).map_err(|e| {
            StorageError::OperationFailed(format!("Failed to save storage file: {}", e))
        })?;

        debug!("Successfully updated encrypted data for key: {}", key);
        Ok(result)
    }

    /// List all keys in storage
    pub fn list_keys(&self) -> std::result::Result<Vec<String>, StorageError> {
        let _guard = storage_file_lock()
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        let storage_data = self.load_storage_file().map_err(|e| {
            StorageError::OperationFailed(format!("Failed to load storage file: {}", e))
        })?;

        Ok(storage_data.keys().cloned().collect())
    }

    /// Load storage data from file
    fn load_storage_file(&self) -> AnyResult<HashMap<String, EncryptedData>> {
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

        let storage_data: HashMap<String, EncryptedData> =
            serde_json::from_str(&file_content).context("Failed to parse storage file JSON")?;

        debug!("Loaded storage file with {} entries", storage_data.len());
        Ok(storage_data)
    }

    /// Save storage data to file
    fn save_storage_file(&self, storage_data: &HashMap<String, EncryptedData>) -> AnyResult<()> {
        // Ensure the parent directory exists
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create storage directory: {:?}", parent))?;
        }

        let file_content = serde_json::to_string_pretty(storage_data)
            .context("Failed to serialize storage data to JSON")?;

        let temp_path = self.storage_path.with_extension("json.tmp");
        {
            let mut temp_file = File::create(&temp_path)
                .with_context(|| format!("Failed to create temp storage file: {:?}", temp_path))?;
            temp_file
                .write_all(file_content.as_bytes())
                .context("Failed to write temp storage data")?;
            temp_file
                .sync_all()
                .context("Failed to sync temp storage data")?;
        }

        if let Err(rename_error) = fs::rename(&temp_path, &self.storage_path) {
            #[cfg(windows)]
            {
                if self.storage_path.exists() {
                    fs::remove_file(&self.storage_path).with_context(|| {
                        format!(
                            "Failed to replace storage file after rename error: {}",
                            rename_error
                        )
                    })?;
                }
                fs::rename(&temp_path, &self.storage_path).with_context(|| {
                    format!("Failed to replace storage file: {:?}", self.storage_path)
                })?;
            }

            #[cfg(not(windows))]
            {
                return Err(rename_error).with_context(|| {
                    format!("Failed to replace storage file: {:?}", self.storage_path)
                });
            }
        }

        debug!("Saved storage file with {} entries", storage_data.len());
        Ok(())
    }
}
