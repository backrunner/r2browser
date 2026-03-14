use crate::storage::SecureStorage;
use crate::types::{StorageConfig, StorageError};
// Use explicit std::result::Result to avoid alias collisions
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::result::Result as StdResult;
use tracing::{debug, info, warn};
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
#[derive(Clone)]
pub struct SessionStore {
    secure_storage: SecureStorage,
}

impl SessionStore {
    /// Create a new session store
    pub fn new() -> StdResult<Self, StorageError> {
        let secure_storage = SecureStorage::new()?;

        info!("SessionStore initialized with encrypted storage");
        Ok(Self { secure_storage })
    }

    /// Save a new session configuration
    pub fn save_session(
        &self,
        session_id: &str,
        config: StorageConfig,
    ) -> StdResult<(), StorageError> {
        debug!("Saving session: {}", session_id);

        // Check if session already exists
        let session_data = if let Ok(existing) = self.secure_storage.load::<SessionData>(session_id)
        {
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
    pub fn get_sessions(&self) -> StdResult<HashMap<String, StorageConfig>, StorageError> {
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
    pub fn get_session_data(&self, session_id: &str) -> StdResult<SessionData, StorageError> {
        debug!("Loading session data: {}", session_id);

        let session_data: SessionData = self.secure_storage.load(session_id)?;
        debug!("Session data loaded: {}", session_id);
        Ok(session_data)
    }

    /// Get all session data without mutating access statistics
    pub fn get_all_session_data(&self) -> StdResult<Vec<SessionData>, StorageError> {
        debug!("Loading all session data");

        let keys = self.secure_storage.list_keys()?;
        let mut sessions = Vec::new();

        for key in keys {
            match self.secure_storage.load::<SessionData>(&key) {
                Ok(session_data) => sessions.push(session_data),
                Err(e) => warn!("Failed to load session {}: {}", key, e),
            }
        }

        sessions.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
        Ok(sessions)
    }

    /// Explicitly update the access statistics for a session
    pub fn record_session_access(&self, session_id: &str) -> StdResult<SessionData, StorageError> {
        debug!("Recording session access: {}", session_id);

        let mut session_data: SessionData = self.secure_storage.load(session_id)?;
        session_data.last_accessed = Utc::now();
        session_data.access_count += 1;
        self.secure_storage.save(session_id, &session_data)?;

        Ok(session_data)
    }

    /// Delete a session
    pub fn delete_session(&self, session_id: &str) -> StdResult<(), StorageError> {
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
    ) -> StdResult<(), StorageError> {
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
    pub fn get_session_stats(&self) -> StdResult<SessionStats, StorageError> {
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

        debug!(
            "Session statistics generated: {} total sessions",
            stats.total_sessions
        );
        Ok(stats)
    }

    /// Generate a unique session ID
    pub fn generate_session_id() -> String {
        format!("session_{}", Uuid::new_v4())
    }

    /// Generate a user-friendly session name based on config
    fn generate_session_name(&self, config: &StorageConfig) -> String {
        match config {
            StorageConfig::R2 {
                account_id,
                bucket_name,
                ..
            } => {
                format!("R2: {}/{}", account_id, bucket_name)
            }
            StorageConfig::S3 {
                endpoint,
                bucket_name,
                ..
            } => {
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
