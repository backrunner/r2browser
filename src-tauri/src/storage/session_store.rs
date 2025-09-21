use crate::storage::SecureStorage;
use crate::types::{StorageConfig, StorageError};
use anyhow::Result;
use chrono::{DateTime, Utc};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Session data structure with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub id: String,
    pub name: String,
    pub config: StorageConfig,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
    pub access_count: u64,
    pub is_favorite: bool,
    pub tags: Vec<String>,
}

/// Session statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionStats {
    pub total_sessions: usize,
    pub recent_sessions: Vec<SessionSummary>,
    pub favorite_sessions: Vec<SessionSummary>,
}

/// Summary information for a session
#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub last_accessed: DateTime<Utc>,
    pub access_count: u64,
}

/// Session store for managing encrypted storage configurations
pub struct SessionStore {
    secure_storage: SecureStorage,
}

impl SessionStore {
    /// Create a new session store
    pub fn new() -> Result<Self, StorageError> {
        let secure_storage = SecureStorage::new()?;

        info!("SessionStore initialized with encrypted storage");
        Ok(Self { secure_storage })
    }

    /// Save a new session configuration
    pub fn save_session(&self, session_id: &str, config: StorageConfig) -> Result<(), StorageError> {
        debug!("Saving session: {}", session_id);

        // Check if session already exists
        let session_data = if let Ok(existing) = self.secure_storage.load::<SessionData>(session_id) {
            // Update existing session
            SessionData {
                last_accessed: Utc::now(),
                access_count: existing.access_count + 1,
                config,
                ..existing
            }
        } else {
            // Create new session
            SessionData {
                id: session_id.to_string(),
                name: self.generate_session_name(&config),
                config,
                created_at: Utc::now(),
                last_accessed: Utc::now(),
                access_count: 1,
                is_favorite: false,
                tags: Vec::new(),
            }
        };

        self.secure_storage.save(session_id, &session_data)?;

        info!("Session saved successfully: {}", session_id);
        Ok(())
    }

    /// Load all sessions
    pub fn get_sessions(&self) -> Result<HashMap<String, StorageConfig>, StorageError> {
        debug!("Loading all sessions");

        let keys = self.secure_storage.list_keys()?;
        let mut sessions = HashMap::new();

        for key in keys {
            match self.secure_storage.load::<SessionData>(&key) {
                Ok(session_data) => {
                    sessions.insert(key, session_data.config);
                }
                Err(e) => {
                    warn!("Failed to load session {}: {}", key, e);
                    // Continue loading other sessions
                }
            }
        }

        debug!("Loaded {} sessions", sessions.len());
        Ok(sessions)
    }

    /// Get detailed session information
    pub fn get_session_data(&self, session_id: &str) -> Result<SessionData, StorageError> {
        debug!("Loading session data: {}", session_id);

        let mut session_data: SessionData = self.secure_storage.load(session_id)?;

        // Update access information
        session_data.last_accessed = Utc::now();
        session_data.access_count += 1;

        // Save updated access info
        self.secure_storage.save(session_id, &session_data)?;

        debug!("Session data loaded: {}", session_id);
        Ok(session_data)
    }

    /// Delete a session
    pub fn delete_session(&self, session_id: &str) -> Result<(), StorageError> {
        debug!("Deleting session: {}", session_id);

        self.secure_storage.remove(session_id)?;

        info!("Session deleted successfully: {}", session_id);
        Ok(())
    }

    /// Update session metadata
    pub fn update_session_metadata(
        &self,
        session_id: &str,
        name: Option<String>,
        is_favorite: Option<bool>,
        tags: Option<Vec<String>>,
    ) -> Result<(), StorageError> {
        debug!("Updating session metadata: {}", session_id);

        let mut session_data: SessionData = self.secure_storage.load(session_id)?;

        if let Some(name) = name {
            session_data.name = name;
        }
        if let Some(is_favorite) = is_favorite {
            session_data.is_favorite = is_favorite;
        }
        if let Some(tags) = tags {
            session_data.tags = tags;
        }

        session_data.last_accessed = Utc::now();

        self.secure_storage.save(session_id, &session_data)?;

        debug!("Session metadata updated: {}", session_id);
        Ok(())
    }

    /// Get session statistics
    pub fn get_session_stats(&self) -> Result<SessionStats, StorageError> {
        debug!("Generating session statistics");

        let keys = self.secure_storage.list_keys()?;
        let mut all_sessions = Vec::new();

        for key in keys {
            if let Ok(session_data) = self.secure_storage.load::<SessionData>(&key) {
                all_sessions.push(session_data);
            }
        }

        // Sort by last accessed for recent sessions
        let mut recent_sessions = all_sessions.clone();
        recent_sessions.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
        let recent_sessions: Vec<SessionSummary> = recent_sessions
            .iter()
            .take(10) // Top 10 recent sessions
            .map(|s| self.session_to_summary(s))
            .collect();

        // Filter and sort favorite sessions
        let mut favorite_sessions: Vec<SessionSummary> = all_sessions
            .iter()
            .filter(|s| s.is_favorite)
            .map(|s| self.session_to_summary(s))
            .collect();
        favorite_sessions.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));

        let stats = SessionStats {
            total_sessions: all_sessions.len(),
            recent_sessions,
            favorite_sessions,
        };

        debug!("Session statistics generated: {} total sessions", stats.total_sessions);
        Ok(stats)
    }

    /// Generate a unique session ID
    pub fn generate_session_id() -> String {
        format!("session_{}", Uuid::new_v4())
    }

    /// Check if a session exists
    pub fn session_exists(&self, session_id: &str) -> bool {
        self.secure_storage.exists(session_id)
    }

    /// Clear all sessions (dangerous operation)
    pub fn clear_all_sessions(&self) -> Result<(), StorageError> {
        warn!("Clearing all sessions - this is a destructive operation");

        self.secure_storage.clear()?;

        info!("All sessions cleared");
        Ok(())
    }

    /// Export sessions for backup (encrypted)
    pub fn export_sessions(&self) -> Result<Vec<SessionData>, StorageError> {
        debug!("Exporting sessions for backup");

        let keys = self.secure_storage.list_keys()?;
        let mut sessions = Vec::new();

        for key in keys {
            if let Ok(session_data) = self.secure_storage.load::<SessionData>(&key) {
                sessions.push(session_data);
            }
        }

        debug!("Exported {} sessions", sessions.len());
        Ok(sessions)
    }

    /// Import sessions from backup
    pub fn import_sessions(&self, sessions: Vec<SessionData>) -> Result<usize, StorageError> {
        debug!("Importing {} sessions from backup", sessions.len());

        let mut imported_count = 0;

        for session_data in sessions {
            match self.secure_storage.save(&session_data.id, &session_data) {
                Ok(_) => imported_count += 1,
                Err(e) => warn!("Failed to import session {}: {}", session_data.id, e),
            }
        }

        info!("Successfully imported {} sessions", imported_count);
        Ok(imported_count)
    }

    /// Generate a user-friendly session name based on config
    fn generate_session_name(&self, config: &StorageConfig) -> String {
        match config {
            StorageConfig::R2 { account_id, bucket_name, .. } => {
                format!("R2: {}/{}", account_id, bucket_name)
            }
            StorageConfig::S3 { endpoint, bucket_name, .. } => {
                let host = endpoint
                    .strip_prefix("https://")
                    .or_else(|| endpoint.strip_prefix("http://"))
                    .unwrap_or(endpoint);
                format!("S3: {}/{}", host, bucket_name)
            }
        }
    }

    /// Convert session data to summary
    fn session_to_summary(&self, session: &SessionData) -> SessionSummary {
        let provider_type = match &session.config {
            StorageConfig::R2 { .. } => "Cloudflare R2".to_string(),
            StorageConfig::S3 { .. } => "S3 Compatible".to_string(),
        };

        SessionSummary {
            id: session.id.clone(),
            name: session.name.clone(),
            provider_type,
            last_accessed: session.last_accessed,
            access_count: session.access_count,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::StorageConfig;

    fn create_test_config() -> StorageConfig {
        StorageConfig::R2 {
            account_id: "test_account".to_string(),
            access_key_id: "test_key".to_string(),
            secret_access_key: "test_secret".to_string(),
            bucket_name: "test_bucket".to_string(),
            session_name: "Test Session".to_string(),
        }
    }

    #[tokio::test]
    async fn test_session_crud_operations() {
        let session_store = SessionStore::new().unwrap();
        let session_id = SessionStore::generate_session_id();
        let config = create_test_config();

        // Save session
        session_store.save_session(&session_id, config.clone()).unwrap();
        assert!(session_store.session_exists(&session_id));

        // Get session
        let session_data = session_store.get_session_data(&session_id).unwrap();
        assert_eq!(session_data.id, session_id);
        assert_eq!(session_data.access_count, 2); // 1 from save, 1 from get

        // Update metadata
        session_store.update_session_metadata(
            &session_id,
            Some("Updated Name".to_string()),
            Some(true),
            Some(vec!["test".to_string(), "favorite".to_string()]),
        ).unwrap();

        let updated_session = session_store.get_session_data(&session_id).unwrap();
        assert_eq!(updated_session.name, "Updated Name");
        assert!(updated_session.is_favorite);
        assert_eq!(updated_session.tags.len(), 2);

        // Delete session
        session_store.delete_session(&session_id).unwrap();
        assert!(!session_store.session_exists(&session_id));
    }

    #[tokio::test]
    async fn test_session_statistics() {
        let session_store = SessionStore::new().unwrap();

        // Create multiple sessions
        for i in 0..5 {
            let session_id = format!("test_session_{}", i);
            let mut config = create_test_config();

            // Modify config to create variety
            if let StorageConfig::R2 { bucket_name, .. } = &mut config {
                *bucket_name = format!("bucket_{}", i);
            }

            session_store.save_session(&session_id, config).unwrap();

            // Mark some as favorites
            if i % 2 == 0 {
                session_store.update_session_metadata(
                    &session_id,
                    None,
                    Some(true),
                    None,
                ).unwrap();
            }
        }

        let stats = session_store.get_session_stats().unwrap();
        assert_eq!(stats.total_sessions, 5);
        assert_eq!(stats.favorite_sessions.len(), 3); // Sessions 0, 2, 4
        assert!(stats.recent_sessions.len() <= 10);
    }

    #[tokio::test]
    async fn test_session_export_import() {
        let session_store = SessionStore::new().unwrap();

        // Create test sessions
        let mut session_ids = Vec::new();
        for i in 0..3 {
            let session_id = format!("export_test_{}", i);
            let config = create_test_config();
            session_store.save_session(&session_id, config).unwrap();
            session_ids.push(session_id);
        }

        // Export sessions
        let exported_sessions = session_store.export_sessions().unwrap();
        assert_eq!(exported_sessions.len(), 3);

        // Clear all sessions
        session_store.clear_all_sessions().unwrap();
        let stats = session_store.get_session_stats().unwrap();
        assert_eq!(stats.total_sessions, 0);

        // Import sessions back
        let imported_count = session_store.import_sessions(exported_sessions).unwrap();
        assert_eq!(imported_count, 3);

        // Verify sessions are back
        let final_stats = session_store.get_session_stats().unwrap();
        assert_eq!(final_stats.total_sessions, 3);
    }
}