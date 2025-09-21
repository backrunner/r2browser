use anyhow::{Context, Result};
use aes_gcm::aead::OsRng;
use dirs;
use log::{debug, info, warn};
use pkcs8::{DecodePrivateKey, DecodePublicKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::{RsaPrivateKey, RsaPublicKey};
use std::fs;
use std::path::{Path, PathBuf};

/// Key manager for handling RSA key pair generation and persistence
pub struct KeyManager {
    app_data_dir: PathBuf,
    private_key_path: PathBuf,
    public_key_path: PathBuf,
}

impl KeyManager {
    /// Create a new key manager instance
    pub fn new() -> Result<Self> {
        let app_data_dir = Self::get_app_data_dir()?;

        // Ensure the app data directory exists
        if !app_data_dir.exists() {
            fs::create_dir_all(&app_data_dir)
                .with_context(|| format!("Failed to create app data directory: {:?}", app_data_dir))?;
            info!("Created app data directory: {:?}", app_data_dir);
        }

        let private_key_path = app_data_dir.join("private_key.pem");
        let public_key_path = app_data_dir.join("public_key.pem");

        Ok(Self {
            app_data_dir,
            private_key_path,
            public_key_path,
        })
    }

    /// Get the application data directory path
    fn get_app_data_dir() -> Result<PathBuf> {
        let data_dir = dirs::data_dir()
            .context("Failed to get user data directory")?;

        Ok(data_dir.join("r2browser"))
    }

    /// Generate a new RSA key pair (2048-bit)
    pub fn generate_key_pair(&self) -> Result<(RsaPublicKey, RsaPrivateKey)> {
        info!("Generating new RSA key pair...");

        let mut rng = OsRng;
        let bits = 2048;

        let private_key = RsaPrivateKey::new(&mut rng, bits)
            .context("Failed to generate RSA private key")?;

        let public_key = RsaPublicKey::from(&private_key);

        debug!("RSA key pair generated successfully");
        Ok((public_key, private_key))
    }

    /// Save RSA key pair to disk in PEM format
    pub fn save_key_pair(&self, public_key: &RsaPublicKey, private_key: &RsaPrivateKey) -> Result<()> {
        info!("Saving RSA key pair to disk...");

        // Save private key
        let private_key_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .context("Failed to encode private key to PEM")?;

        fs::write(&self.private_key_path, private_key_pem.as_bytes())
            .with_context(|| format!("Failed to write private key to {:?}", self.private_key_path))?;

        // Save public key
        let public_key_pem = public_key
            .to_public_key_pem(LineEnding::LF)
            .context("Failed to encode public key to PEM")?;

        fs::write(&self.public_key_path, public_key_pem.as_bytes())
            .with_context(|| format!("Failed to write public key to {:?}", self.public_key_path))?;

        // Set restrictive permissions on private key (Unix-like systems)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.private_key_path)?.permissions();
            perms.set_mode(0o600); // Read/write for owner only
            fs::set_permissions(&self.private_key_path, perms)?;
        }

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
        let private_key_pem = fs::read_to_string(&self.private_key_path)
            .with_context(|| format!("Failed to read private key from {:?}", self.private_key_path))?;

        let private_key = RsaPrivateKey::from_pkcs8_pem(&private_key_pem)
            .context("Failed to decode private key from PEM")?;

        // Load public key
        let public_key_pem = fs::read_to_string(&self.public_key_path)
            .with_context(|| format!("Failed to read public key from {:?}", self.public_key_path))?;

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
                warn!("No existing key pair found, generating new one");
                let key_pair = self.generate_key_pair()?;
                self.save_key_pair(&key_pair.0, &key_pair.1)?;
                info!("Generated and saved new RSA key pair");
                Ok(key_pair)
            }
        }
    }

    /// Check if key pair exists on disk
    pub fn key_pair_exists(&self) -> bool {
        self.private_key_path.exists() && self.public_key_path.exists()
    }

    /// Delete existing key pair from disk
    pub fn delete_key_pair(&self) -> Result<()> {
        warn!("Deleting RSA key pair from disk");

        if self.private_key_path.exists() {
            fs::remove_file(&self.private_key_path)
                .with_context(|| format!("Failed to delete private key: {:?}", self.private_key_path))?;
            debug!("Deleted private key file");
        }

        if self.public_key_path.exists() {
            fs::remove_file(&self.public_key_path)
                .with_context(|| format!("Failed to delete public key: {:?}", self.public_key_path))?;
            debug!("Deleted public key file");
        }

        info!("RSA key pair deleted successfully");
        Ok(())
    }

    /// Get the application data directory path
    pub fn get_app_data_directory(&self) -> &Path {
        &self.app_data_dir
    }

    /// Get the private key file path
    pub fn get_private_key_path(&self) -> &Path {
        &self.private_key_path
    }

    /// Get the public key file path
    pub fn get_public_key_path(&self) -> &Path {
        &self.public_key_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_key_generation() {
        let key_manager = KeyManager::new().unwrap();
        let (public_key, private_key) = key_manager.generate_key_pair().unwrap();

        // Verify key pair is valid by checking if we can derive public key from private key
        let derived_public_key = RsaPublicKey::from(&private_key);
        assert_eq!(public_key.n(), derived_public_key.n());
        assert_eq!(public_key.e(), derived_public_key.e());
    }

    #[test]
    fn test_key_pair_persistence() {
        let temp_dir = tempdir().unwrap();
        let private_key_path = temp_dir.path().join("test_private.pem");
        let public_key_path = temp_dir.path().join("test_public.pem");

        let key_manager = KeyManager {
            app_data_dir: temp_dir.path().to_path_buf(),
            private_key_path: private_key_path.clone(),
            public_key_path: public_key_path.clone(),
        };

        // Generate and save key pair
        let (original_public, original_private) = key_manager.generate_key_pair().unwrap();
        key_manager.save_key_pair(&original_public, &original_private).unwrap();

        // Verify files exist
        assert!(private_key_path.exists());
        assert!(public_key_path.exists());

        // Load key pair and verify it matches
        let (loaded_public, loaded_private) = key_manager.load_key_pair().unwrap();

        assert_eq!(original_public.n(), loaded_public.n());
        assert_eq!(original_public.e(), loaded_public.e());
        assert_eq!(original_private.n(), loaded_private.n());
        assert_eq!(original_private.d(), loaded_private.d());
    }
}