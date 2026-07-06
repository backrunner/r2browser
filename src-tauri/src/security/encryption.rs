use aes_gcm::{
    aead::{Aead, Generate, KeyInit, Nonce},
    Aes256Gcm, Key,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::rngs::SysRng;
use rsa::{rand_core::UnwrapErr, Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};

/// Encrypted data structure containing both the encrypted content and metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub encrypted_key: String, // RSA-encrypted AES key
    pub nonce: String,         // AES-GCM nonce
    pub ciphertext: String,    // AES-encrypted data
}

/// Encryption service for handling RSA + AES hybrid encryption
#[derive(Clone)]
pub struct EncryptionService {
    public_key: RsaPublicKey,
    private_key: RsaPrivateKey,
}

impl EncryptionService {
    /// Create a new encryption service with the provided RSA key pair
    pub fn new(public_key: RsaPublicKey, private_key: RsaPrivateKey) -> Self {
        Self {
            public_key,
            private_key,
        }
    }

    /// Encrypt data using hybrid RSA + AES encryption
    /// - Generate a random AES-256 key
    /// - Encrypt data with AES-GCM
    /// - Encrypt AES key with RSA public key
    pub fn encrypt(&self, data: &[u8]) -> Result<EncryptedData> {
        // Generate random AES key
        let aes_key = Key::<Aes256Gcm>::generate();
        let cipher = Aes256Gcm::new(&aes_key);

        // Generate random nonce for AES-GCM
        let nonce = Nonce::<Aes256Gcm>::generate();

        // Encrypt data with AES
        let ciphertext = cipher
            .encrypt(&nonce, data)
            .map_err(|e| anyhow::anyhow!("Failed to encrypt data with AES: {}", e))?;

        // Encrypt AES key with RSA
        let mut rng = UnwrapErr(SysRng);
        let encrypted_key = self
            .public_key
            .encrypt(&mut rng, Pkcs1v15Encrypt, &aes_key)
            .context("Failed to encrypt AES key with RSA")?;

        Ok(EncryptedData {
            encrypted_key: BASE64.encode(&encrypted_key),
            nonce: BASE64.encode(nonce.as_slice()),
            ciphertext: BASE64.encode(&ciphertext),
        })
    }

    /// Decrypt data using hybrid RSA + AES decryption
    pub fn decrypt(&self, encrypted_data: &EncryptedData) -> Result<Vec<u8>> {
        // Decode base64 data
        let encrypted_key = BASE64
            .decode(&encrypted_data.encrypted_key)
            .context("Failed to decode encrypted key")?;
        let nonce = BASE64
            .decode(&encrypted_data.nonce)
            .context("Failed to decode nonce")?;
        let ciphertext = BASE64
            .decode(&encrypted_data.ciphertext)
            .context("Failed to decode ciphertext")?;

        // Decrypt AES key with RSA
        let aes_key = self
            .private_key
            .decrypt(Pkcs1v15Encrypt, &encrypted_key)
            .context("Failed to decrypt AES key with RSA")?;

        // Create AES cipher
        let key = Key::<Aes256Gcm>::try_from(aes_key.as_slice())
            .context("Invalid AES key length")?;
        let cipher = Aes256Gcm::new(&key);
        let nonce = Nonce::<Aes256Gcm>::try_from(nonce.as_slice())
            .context("Invalid AES nonce length")?;

        // Decrypt data with AES
        let plaintext = cipher
            .decrypt(&nonce, ciphertext.as_ref())
            .map_err(|e| anyhow::anyhow!("Failed to decrypt data with AES: {}", e))?;

        Ok(plaintext)
    }

    /// Encrypt a JSON-serializable object
    pub fn encrypt_json<T: Serialize>(&self, data: &T) -> Result<EncryptedData> {
        let json_data = serde_json::to_vec(data).context("Failed to serialize data to JSON")?;
        self.encrypt(&json_data)
    }

    /// Decrypt to a JSON-deserializable object
    pub fn decrypt_json<T: for<'de> Deserialize<'de>>(
        &self,
        encrypted_data: &EncryptedData,
    ) -> Result<T> {
        let decrypted_data = self.decrypt(encrypted_data)?;
        let result =
            serde_json::from_slice(&decrypted_data).context("Failed to deserialize JSON data")?;
        Ok(result)
    }
}
