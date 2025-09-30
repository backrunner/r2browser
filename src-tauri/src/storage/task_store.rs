use crate::storage::SecureStorage;
use crate::types::StorageError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::result::Result as StdResult;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Task status enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Task type enumeration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    Upload {
        local_path: String,
        remote_key: String,
        content_type: Option<String>,
    },
    Download {
        remote_key: String,
        local_path: String,
    },
}

/// Multipart upload metadata for resumption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultipartUploadInfo {
    pub upload_id: String,
    pub bucket_name: String,
    pub key: String,
    pub part_number: i32,
    pub completed_parts: Vec<PartInfo>,
    pub total_size: u64,
    pub uploaded_size: u64,
}

/// Information about completed parts in multipart upload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartInfo {
    pub part_number: i32,
    pub etag: String,
    pub size: u64,
}

/// Persistent task data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskData {
    pub id: String,
    pub session_id: String,
    pub task_type: TaskType,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub progress: f64, // 0.0 to 100.0
    pub total_size: u64,
    pub transferred_size: u64,
    pub error_message: Option<String>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub multipart_info: Option<MultipartUploadInfo>,
}

/// Task statistics
#[derive(Debug, Serialize, Deserialize)]
pub struct TaskStats {
    pub total_tasks: usize,
    pub active_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub pending_tasks: usize,
}

/// Store for managing persistent task data
pub struct TaskStore {
    secure_storage: SecureStorage,
}

impl TaskStore {
    /// Create a new task store
    pub fn new() -> StdResult<Self, StorageError> {
        let secure_storage = SecureStorage::new()?;

        info!("TaskStore initialized with encrypted storage");
        Ok(Self { secure_storage })
    }

    /// Save or update a task
    pub fn save_task(&self, task: &TaskData) -> StdResult<(), StorageError> {
        debug!("Saving task: {}", task.id);

        let mut updated_task = task.clone();
        updated_task.updated_at = Utc::now();

        // Use session-prefixed key to separate tasks by session
        let storage_key = format!("task_{}_{}", task.session_id, task.id);
        self.secure_storage.save(&storage_key, &updated_task)?;

        debug!("Task saved successfully: {}", task.id);
        Ok(())
    }

    /// Create a new task
    pub fn create_task(
        &self,
        session_id: String,
        task_type: TaskType,
        total_size: u64,
    ) -> StdResult<TaskData, StorageError> {
        let task_id = format!("task_{}", Uuid::new_v4());
        let now = Utc::now();

        let task = TaskData {
            id: task_id,
            session_id,
            task_type,
            status: TaskStatus::Pending,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
            progress: 0.0,
            total_size,
            transferred_size: 0,
            error_message: None,
            retry_count: 0,
            max_retries: 3,
            multipart_info: None,
        };

        self.save_task(&task)?;

        info!("New task created: {}", task.id);
        Ok(task)
    }

    /// Load a task by ID
    pub fn get_task(&self, task_id: &str) -> StdResult<TaskData, StorageError> {
        debug!("Loading task: {}", task_id);

        // Since we don't know the session_id, we need to search through all keys
        let keys = self.secure_storage.list_keys()?;
        for key in keys {
            if let Some(suffix) = key.strip_prefix("task_") {
                if suffix.ends_with(&format!("_{}", task_id)) {
                    let task: TaskData = self.secure_storage.load(&key)?;
                    if task.id == task_id {
                        debug!("Task loaded: {}", task_id);
                        return Ok(task);
                    }
                }
            }
        }

        Err(StorageError::OperationFailed(format!("Task not found: {}", task_id)))
    }

    /// Get all tasks for a session
    pub fn get_session_tasks(&self, session_id: &str) -> StdResult<Vec<TaskData>, StorageError> {
        debug!("Loading tasks for session: {}", session_id);

        let keys = self.secure_storage.list_keys()?;
        let mut tasks = Vec::new();
        let prefix = format!("task_{}_", session_id);

        for key in keys {
            if key.starts_with(&prefix) {
                match self.secure_storage.load::<TaskData>(&key) {
                    Ok(task) if task.session_id == session_id => {
                        tasks.push(task);
                    }
                    Ok(_) => {
                        // Task belongs to different session, skip
                    }
                    Err(e) => {
                        warn!("Failed to load task {}: {}", key, e);
                    }
                }
            }
        }

        // Sort by created_at descending
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        debug!("Loaded {} tasks for session: {}", tasks.len(), session_id);
        Ok(tasks)
    }

    /// Get tasks by status
    pub fn get_tasks_by_status(
        &self,
        session_id: &str,
        status: TaskStatus,
    ) -> StdResult<Vec<TaskData>, StorageError> {
        let all_tasks = self.get_session_tasks(session_id)?;
        let filtered_tasks: Vec<TaskData> = all_tasks
            .into_iter()
            .filter(|task| task.status == status)
            .collect();

        debug!("Found {} tasks with status {:?} for session: {}",
               filtered_tasks.len(), status, session_id);
        Ok(filtered_tasks)
    }

    /// Get unfinished tasks (pending, in_progress, paused)
    pub fn get_unfinished_tasks(&self, session_id: &str) -> StdResult<Vec<TaskData>, StorageError> {
        let all_tasks = self.get_session_tasks(session_id)?;
        let unfinished_tasks: Vec<TaskData> = all_tasks
            .into_iter()
            .filter(|task| matches!(task.status,
                TaskStatus::Pending | TaskStatus::InProgress | TaskStatus::Paused))
            .collect();

        debug!("Found {} unfinished tasks for session: {}",
               unfinished_tasks.len(), session_id);
        Ok(unfinished_tasks)
    }

    /// Update task status
    pub fn update_task_status(
        &self,
        task_id: &str,
        status: TaskStatus,
        error_message: Option<String>,
    ) -> StdResult<(), StorageError> {
        debug!("Updating task status: {} -> {:?}", task_id, status);

        let mut task = self.get_task(task_id)?;
        task.status = status.clone();
        task.error_message = error_message;
        task.updated_at = Utc::now();

        match status {
            TaskStatus::InProgress => {
                if task.started_at.is_none() {
                    task.started_at = Some(Utc::now());
                }
            }
            TaskStatus::Completed | TaskStatus::Failed | TaskStatus::Cancelled => {
                task.completed_at = Some(Utc::now());
            }
            _ => {}
        }

        self.save_task(&task)?;

        debug!("Task status updated: {}", task_id);
        Ok(())
    }

    /// Update task progress
    pub fn update_task_progress(
        &self,
        task_id: &str,
        transferred_size: u64,
        total_size: Option<u64>,
    ) -> StdResult<(), StorageError> {
        let mut task = self.get_task(task_id)?;

        task.transferred_size = transferred_size;
        if let Some(total) = total_size {
            task.total_size = total;
        }

        task.progress = if task.total_size > 0 {
            (transferred_size as f64 / task.total_size as f64) * 100.0
        } else {
            0.0
        };

        task.updated_at = Utc::now();

        self.save_task(&task)?;

        debug!("Task progress updated: {} - {:.1}%", task_id, task.progress);
        Ok(())
    }

    /// Update multipart upload info
    pub fn update_multipart_info(
        &self,
        task_id: &str,
        multipart_info: MultipartUploadInfo,
    ) -> StdResult<(), StorageError> {
        debug!("Updating multipart info for task: {}", task_id);

        let mut task = self.get_task(task_id)?;
        task.multipart_info = Some(multipart_info);
        task.updated_at = Utc::now();

        self.save_task(&task)?;

        debug!("Multipart info updated for task: {}", task_id);
        Ok(())
    }

    /// Delete a task
    pub fn delete_task(&self, task_id: &str) -> StdResult<(), StorageError> {
        debug!("Deleting task: {}", task_id);

        // Find the task key first
        let keys = self.secure_storage.list_keys()?;
        for key in keys {
            if let Some(suffix) = key.strip_prefix("task_") {
                if suffix.ends_with(&format!("_{}", task_id)) {
                    let task: TaskData = self.secure_storage.load(&key)?;
                    if task.id == task_id {
                        self.secure_storage.remove(&key)?;
                        info!("Task deleted successfully: {}", task_id);
                        return Ok(());
                    }
                }
            }
        }

        Err(StorageError::OperationFailed(format!("Task not found: {}", task_id)))
    }

    /// Delete all tasks for a session
    pub fn delete_session_tasks(&self, session_id: &str) -> StdResult<usize, StorageError> {
        debug!("Deleting all tasks for session: {}", session_id);

        let tasks = self.get_session_tasks(session_id)?;
        let count = tasks.len();

        for task in tasks {
            self.delete_task(&task.id)?;
        }

        info!("Deleted {} tasks for session: {}", count, session_id);
        Ok(count)
    }

    /// Delete completed tasks older than specified days
    pub fn cleanup_old_tasks(&self, days: i64) -> StdResult<usize, StorageError> {
        debug!("Cleaning up tasks older than {} days", days);

        let cutoff_date = Utc::now() - chrono::Duration::days(days);
        let keys = self.secure_storage.list_keys()?;
        let mut deleted_count = 0;

        for key in keys {
            match self.secure_storage.load::<TaskData>(&key) {
                Ok(task) if task.status == TaskStatus::Completed
                    && task.completed_at.unwrap_or(task.created_at) < cutoff_date => {
                    if let Err(e) = self.delete_task(&task.id) {
                        warn!("Failed to delete old task {}: {}", task.id, e);
                    } else {
                        deleted_count += 1;
                    }
                }
                Ok(_) => {
                    // Task doesn't meet cleanup criteria, skip
                }
                Err(e) => {
                    warn!("Failed to load task {} during cleanup: {}", key, e);
                }
            }
        }

        info!("Cleaned up {} old tasks", deleted_count);
        Ok(deleted_count)
    }

    /// Get task statistics
    pub fn get_task_stats(&self, session_id: Option<&str>) -> StdResult<TaskStats, StorageError> {
        debug!("Generating task statistics");

        let tasks = if let Some(session_id) = session_id {
            self.get_session_tasks(session_id)?
        } else {
            // Get all tasks
            let keys = self.secure_storage.list_keys()?;
            let mut all_tasks = Vec::new();

            for key in keys {
                if let Ok(task) = self.secure_storage.load::<TaskData>(&key) {
                    all_tasks.push(task);
                }
            }
            all_tasks
        };

        let total_tasks = tasks.len();
        let active_tasks = tasks.iter()
            .filter(|t| matches!(t.status, TaskStatus::InProgress | TaskStatus::Pending))
            .count();
        let completed_tasks = tasks.iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .count();
        let failed_tasks = tasks.iter()
            .filter(|t| t.status == TaskStatus::Failed)
            .count();
        let pending_tasks = tasks.iter()
            .filter(|t| t.status == TaskStatus::Pending)
            .count();

        let stats = TaskStats {
            total_tasks,
            active_tasks,
            completed_tasks,
            failed_tasks,
            pending_tasks,
        };

        debug!("Task statistics generated: {} total tasks", stats.total_tasks);
        Ok(stats)
    }

    /// Increment retry count for a task
    pub fn increment_retry_count(&self, task_id: &str) -> StdResult<bool, StorageError> {
        let mut task = self.get_task(task_id)?;
        task.retry_count += 1;
        task.updated_at = Utc::now();

        let should_retry = task.retry_count < task.max_retries;

        if !should_retry {
            task.status = TaskStatus::Failed;
            task.error_message = Some("Maximum retry count exceeded".to_string());
            task.completed_at = Some(Utc::now());
        }

        self.save_task(&task)?;

        debug!("Task retry count incremented: {} ({}/{})",
               task_id, task.retry_count, task.max_retries);
        Ok(should_retry)
    }
}

