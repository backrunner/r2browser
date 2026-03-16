use aes_gcm::aead::OsRng;
use anyhow::{bail, Context, Result};
use dirs;
use pkcs8::{DecodePrivateKey, DecodePublicKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

const LOCAL_APP_DATA_DIR: &str = "r2browser";
const ICLOUD_APP_DATA_DIR: &str = "R2 Browser";
const ENCRYPTED_STORAGE_FILE: &str = "encrypted_storage.json";
const ICLOUD_DIR_OVERRIDE_ENV: &str = "R2BROWSER_ICLOUD_DIR";
const STORAGE_PREFERENCES_FILE: &str = "storage_settings.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageSyncPreference {
    icloud_sync_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSyncStatus {
    pub platform: String,
    pub supports_icloud_sync: bool,
    pub icloud_sync_enabled: bool,
    pub icloud_available: bool,
    pub using_icloud_storage: bool,
    pub active_storage_path: String,
    pub local_storage_path: String,
    pub icloud_storage_path: Option<String>,
}

/// Key manager for handling RSA key pair generation and persistence
pub struct KeyManager {
    app_data_dir: PathBuf,
    private_key_path: PathBuf,
    public_key_path: PathBuf,
}

impl KeyManager {
    /// Create a new key manager instance
    pub fn new() -> Result<Self> {
        let legacy_app_data_dir = Self::get_legacy_app_data_dir()?;
        let preferred_app_data_dir = Self::get_app_data_dir(&legacy_app_data_dir);
        let app_data_dir =
            Self::prepare_app_data_dir(&preferred_app_data_dir, &legacy_app_data_dir)?;

        if app_data_dir != legacy_app_data_dir
            && Self::copy_missing_files(&legacy_app_data_dir, &app_data_dir)?
        {
            info!(
                source = %legacy_app_data_dir.display(),
                destination = %app_data_dir.display(),
                "Migrated existing local configuration into iCloud-backed storage"
            );
        }

        let private_key_path = app_data_dir.join("private_key.pem");
        let public_key_path = app_data_dir.join("public_key.pem");

        let key_manager = Self {
            app_data_dir,
            private_key_path,
            public_key_path,
        };

        key_manager.ensure_private_key_permissions()?;

        Ok(key_manager)
    }

    /// Get the application data directory path
    fn get_legacy_app_data_dir() -> Result<PathBuf> {
        let data_dir = dirs::data_dir().context("Failed to get user data directory")?;

        Ok(data_dir.join(LOCAL_APP_DATA_DIR))
    }

    fn get_storage_settings_path() -> Result<PathBuf> {
        if let Some(config_dir) = dirs::config_dir() {
            Ok(config_dir
                .join(LOCAL_APP_DATA_DIR)
                .join(STORAGE_PREFERENCES_FILE))
        } else {
            Ok(Self::get_legacy_app_data_dir()?.join(STORAGE_PREFERENCES_FILE))
        }
    }

    fn load_storage_sync_preference() -> Result<StorageSyncPreference> {
        let settings_path = Self::get_storage_settings_path()?;

        if !settings_path.exists() {
            return Ok(StorageSyncPreference::default());
        }

        let contents = fs::read_to_string(&settings_path)
            .with_context(|| format!("Failed to read storage settings: {:?}", settings_path))?;

        if contents.trim().is_empty() {
            return Ok(StorageSyncPreference::default());
        }

        serde_json::from_str(&contents)
            .with_context(|| format!("Failed to parse storage settings: {:?}", settings_path))
    }

    fn load_storage_sync_preference_or_default() -> StorageSyncPreference {
        match Self::load_storage_sync_preference() {
            Ok(preference) => preference,
            Err(error) => {
                warn!(
                    error = %error,
                    "Failed to load storage sync preference, falling back to defaults"
                );
                StorageSyncPreference::default()
            }
        }
    }

    fn save_storage_sync_preference(preference: &StorageSyncPreference) -> Result<()> {
        let settings_path = Self::get_storage_settings_path()?;

        if let Some(parent) = settings_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create storage settings directory: {:?}", parent)
            })?;
        }

        let contents = serde_json::to_string_pretty(preference)
            .context("Failed to serialize storage sync preference")?;

        fs::write(&settings_path, contents)
            .with_context(|| format!("Failed to write storage settings: {:?}", settings_path))?;

        Ok(())
    }

    fn supports_icloud_sync() -> bool {
        cfg!(target_os = "macos") || cfg!(target_os = "windows")
    }

    fn default_icloud_sync_enabled() -> bool {
        Self::supports_icloud_sync()
    }

    fn resolve_icloud_sync_enabled(preference: &StorageSyncPreference) -> bool {
        preference
            .icloud_sync_enabled
            .unwrap_or_else(Self::default_icloud_sync_enabled)
    }

    fn get_app_data_dir(legacy_app_data_dir: &Path) -> PathBuf {
        let preference = Self::load_storage_sync_preference_or_default();
        let icloud_sync_enabled = Self::resolve_icloud_sync_enabled(&preference);

        if icloud_sync_enabled {
            if let Some(icloud_app_data_dir) = Self::get_icloud_app_data_dir() {
                info!(
                    path = %icloud_app_data_dir.display(),
                    "Using iCloud-backed configuration directory"
                );
                return icloud_app_data_dir;
            }
        }

        legacy_app_data_dir.to_path_buf()
    }

    pub fn get_storage_sync_status() -> Result<StorageSyncStatus> {
        let local_app_data_dir = Self::get_legacy_app_data_dir()?;
        let preference = Self::load_storage_sync_preference_or_default();
        let icloud_sync_enabled = Self::resolve_icloud_sync_enabled(&preference);
        let icloud_app_data_dir = Self::get_icloud_app_data_dir();
        let using_icloud_storage = icloud_sync_enabled && icloud_app_data_dir.is_some();
        let active_storage_path = icloud_app_data_dir
            .as_ref()
            .filter(|_| using_icloud_storage)
            .cloned()
            .unwrap_or_else(|| local_app_data_dir.clone());

        Ok(StorageSyncStatus {
            platform: std::env::consts::OS.to_string(),
            supports_icloud_sync: Self::supports_icloud_sync(),
            icloud_sync_enabled,
            icloud_available: icloud_app_data_dir.is_some(),
            using_icloud_storage,
            active_storage_path: active_storage_path.to_string_lossy().to_string(),
            local_storage_path: local_app_data_dir.to_string_lossy().to_string(),
            icloud_storage_path: icloud_app_data_dir.map(|path| path.to_string_lossy().to_string()),
        })
    }

    pub fn set_icloud_sync_enabled(enabled: bool) -> Result<StorageSyncStatus> {
        let previous_status = Self::get_storage_sync_status()?;

        Self::save_storage_sync_preference(&StorageSyncPreference {
            icloud_sync_enabled: Some(enabled),
        })?;

        let next_status = Self::get_storage_sync_status()?;
        let previous_path = PathBuf::from(&previous_status.active_storage_path);
        let next_path = PathBuf::from(&next_status.active_storage_path);

        if previous_path != next_path {
            let overwrite_existing = !next_status.using_icloud_storage;
            if Self::copy_directory_contents(&previous_path, &next_path, overwrite_existing)? {
                info!(
                    source = %previous_path.display(),
                    destination = %next_path.display(),
                    "Synchronized encrypted configuration after storage sync preference change"
                );
            }
        }

        Ok(next_status)
    }

    fn get_icloud_app_data_dir() -> Option<PathBuf> {
        if !Self::supports_icloud_sync() {
            return None;
        }

        if let Some(override_dir) = std::env::var_os(ICLOUD_DIR_OVERRIDE_ENV) {
            let override_path = PathBuf::from(override_dir);
            if override_path.exists() {
                return Some(override_path.join(ICLOUD_APP_DATA_DIR));
            }

            warn!(
                path = %override_path.display(),
                env = ICLOUD_DIR_OVERRIDE_ENV,
                "Configured iCloud override directory does not exist"
            );
        }

        Self::default_icloud_root().map(|root| root.join(ICLOUD_APP_DATA_DIR))
    }

    #[cfg(target_os = "macos")]
    fn default_icloud_root() -> Option<PathBuf> {
        let home_dir = dirs::home_dir()?;
        let cloud_docs_dir = home_dir
            .join("Library")
            .join("Mobile Documents")
            .join("com~apple~CloudDocs");

        cloud_docs_dir.exists().then_some(cloud_docs_dir)
    }

    #[cfg(target_os = "windows")]
    fn default_icloud_root() -> Option<PathBuf> {
        let home_dir = dirs::home_dir()?;
        let candidate_dirs = [
            home_dir.join("iCloud Drive"),
            home_dir.join("iCloudDrive"),
            home_dir.join("Apple").join("CloudDocs"),
        ];

        candidate_dirs
            .into_iter()
            .find(|candidate| candidate.exists())
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn default_icloud_root() -> Option<PathBuf> {
        None
    }

    fn prepare_app_data_dir(preferred_dir: &Path, fallback_dir: &Path) -> Result<PathBuf> {
        match Self::ensure_app_data_dir(preferred_dir) {
            Ok(()) => Ok(preferred_dir.to_path_buf()),
            Err(error) if preferred_dir != fallback_dir => {
                warn!(
                    preferred = %preferred_dir.display(),
                    fallback = %fallback_dir.display(),
                    error = %error,
                    "Failed to prepare iCloud-backed configuration directory, falling back to local storage"
                );
                Self::ensure_app_data_dir(fallback_dir)?;
                Ok(fallback_dir.to_path_buf())
            }
            Err(error) => Err(error),
        }
    }

    fn ensure_app_data_dir(path: &Path) -> Result<()> {
        if !path.exists() {
            fs::create_dir_all(path)
                .with_context(|| format!("Failed to create app data directory: {:?}", path))?;
            info!("Created app data directory: {:?}", path);
        }

        Ok(())
    }

    fn copy_missing_files(source: &Path, destination: &Path) -> Result<bool> {
        Self::copy_directory_contents(source, destination, false)
    }

    fn copy_directory_contents(
        source: &Path,
        destination: &Path,
        overwrite_existing: bool,
    ) -> Result<bool> {
        if !source.exists() {
            return Ok(false);
        }

        fs::create_dir_all(destination).with_context(|| {
            format!(
                "Failed to create destination app data directory: {:?}",
                destination
            )
        })?;

        let mut copied_anything = false;

        for entry in fs::read_dir(source)
            .with_context(|| format!("Failed to read source app data directory: {:?}", source))?
        {
            let entry = entry?;
            let source_path = entry.path();
            let destination_path = destination.join(entry.file_name());
            let file_type = entry.file_type()?;

            if file_type.is_dir() {
                if Self::copy_directory_contents(
                    &source_path,
                    &destination_path,
                    overwrite_existing,
                )? {
                    copied_anything = true;
                }
                continue;
            }

            if destination_path.exists() && !overwrite_existing {
                continue;
            }

            fs::copy(&source_path, &destination_path).with_context(|| {
                format!(
                    "Failed to migrate app data file from {:?} to {:?}",
                    source_path, destination_path
                )
            })?;
            copied_anything = true;
        }

        Ok(copied_anything)
    }

    fn ensure_private_key_permissions(&self) -> Result<()> {
        #[cfg(unix)]
        if self.private_key_path.exists() {
            use std::os::unix::fs::PermissionsExt;

            let mut perms = fs::metadata(&self.private_key_path)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&self.private_key_path, perms)?;
        }

        Ok(())
    }

    fn has_existing_encrypted_state(&self) -> bool {
        self.private_key_path.exists()
            || self.public_key_path.exists()
            || self.app_data_dir.join(ENCRYPTED_STORAGE_FILE).exists()
    }

    /// Generate a new RSA key pair (2048-bit)
    pub fn generate_key_pair(&self) -> Result<(RsaPublicKey, RsaPrivateKey)> {
        info!("Generating new RSA key pair...");

        let mut rng = OsRng;
        let bits = 2048;

        let private_key =
            RsaPrivateKey::new(&mut rng, bits).context("Failed to generate RSA private key")?;

        let public_key = RsaPublicKey::from(&private_key);

        debug!("RSA key pair generated successfully");
        Ok((public_key, private_key))
    }

    /// Save RSA key pair to disk in PEM format
    pub fn save_key_pair(
        &self,
        public_key: &RsaPublicKey,
        private_key: &RsaPrivateKey,
    ) -> Result<()> {
        info!("Saving RSA key pair to disk...");

        // Save private key
        let private_key_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .context("Failed to encode private key to PEM")?;

        fs::write(&self.private_key_path, private_key_pem.as_bytes()).with_context(|| {
            format!("Failed to write private key to {:?}", self.private_key_path)
        })?;

        // Save public key
        let public_key_pem = public_key
            .to_public_key_pem(LineEnding::LF)
            .context("Failed to encode public key to PEM")?;

        fs::write(&self.public_key_path, public_key_pem.as_bytes())
            .with_context(|| format!("Failed to write public key to {:?}", self.public_key_path))?;

        self.ensure_private_key_permissions()?;

        info!("RSA key pair saved successfully");
        debug!("Private key saved to: {:?}", self.private_key_path);
        debug!("Public key saved to: {:?}", self.public_key_path);

        Ok(())
    }

    /// Load RSA key pair from disk
    pub fn load_key_pair(&self) -> Result<(RsaPublicKey, RsaPrivateKey)> {
        debug!("Loading RSA key pair from disk...");

        // Check if both key files exist
        if !self.private_key_path.exists() || !self.public_key_path.exists() {
            return Err(anyhow::anyhow!(
                "Key pair files not found. Private key: {}, Public key: {}",
                self.private_key_path.exists(),
                self.public_key_path.exists()
            ));
        }

        // Load private key
        let private_key_pem = fs::read_to_string(&self.private_key_path).with_context(|| {
            format!(
                "Failed to read private key from {:?}",
                self.private_key_path
            )
        })?;

        let private_key = RsaPrivateKey::from_pkcs8_pem(&private_key_pem)
            .context("Failed to decode private key from PEM")?;

        // Load public key
        let public_key_pem = fs::read_to_string(&self.public_key_path).with_context(|| {
            format!("Failed to read public key from {:?}", self.public_key_path)
        })?;

        let public_key = RsaPublicKey::from_public_key_pem(&public_key_pem)
            .context("Failed to decode public key from PEM")?;

        debug!("RSA key pair loaded successfully");
        Ok((public_key, private_key))
    }

    /// Get or create RSA key pair (load from disk if exists, otherwise generate new)
    pub fn get_or_create_key_pair(&self) -> Result<(RsaPublicKey, RsaPrivateKey)> {
        match self.load_key_pair() {
            Ok(key_pair) => {
                info!("Loaded existing RSA key pair");
                Ok(key_pair)
            }
            Err(_) => {
                if self.has_existing_encrypted_state() {
                    bail!(
                        "Encrypted configuration exists at {:?}, but the key pair is incomplete. Please wait for iCloud sync to finish or restore the missing key files before continuing.",
                        self.app_data_dir
                    );
                }

                warn!("No existing key pair found, generating new one");
                let key_pair = self.generate_key_pair()?;
                self.save_key_pair(&key_pair.0, &key_pair.1)?;
                info!("Generated and saved new RSA key pair");
                Ok(key_pair)
            }
        }
    }

    /// Get the application data directory path
    pub fn get_app_data_directory(&self) -> &Path {
        &self.app_data_dir
    }
}
