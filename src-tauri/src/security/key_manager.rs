use anyhow::{Context, Result};
use aes_gcm::aead::OsRng;
use dirs;
use tracing::{debug, info, warn};
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

    /// Get the application data directory path
    pub fn get_app_data_directory(&self) -> &Path {
        &self.app_data_dir
    }
}

