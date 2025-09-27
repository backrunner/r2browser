use crate::storage::{TaskStore, TaskData, TaskStatus, TaskType, TaskStats, MultipartUploadInfo};
use crate::types::StorageError;
use std::sync::Mutex;
use tauri::State;
use tracing::{debug, info};

/// Shared task store state
pub struct TaskStoreState(pub Mutex<TaskStore>);

impl TaskStoreState {
    pub fn new() -> Result<Self, StorageError> {
        let task_store = TaskStore::new()?;
        Ok(TaskStoreState(Mutex::new(task_store)))
    }
}

/// Create a new task
#[tauri::command]
pub async fn create_task(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
    task_type: String,
    local_path: Option<String>,
    remote_key: String,
    content_type: Option<String>,
    total_size: u64,
) -> Result<TaskData, String> {
    debug!("Creating task: {} for session: {}", task_type, session_id);

    let task_type_enum = match task_type.as_str() {
        "upload" => {
            let local_path = local_path.ok_or("Local path required for upload task")?;
            TaskType::Upload {
                local_path,
                remote_key,
                content_type,
            }
        }
        "download" => TaskType::Download {
            remote_key,
            local_path: local_path.ok_or("Local path required for download task")?,
        },
        _ => return Err("Invalid task type".to_string()),
    };

    let store = task_store.0.lock().unwrap();
    let task = store
        .create_task(session_id, task_type_enum, total_size)
        .map_err(|e| e.to_string())?;

    info!("Task created: {}", task.id);
    Ok(task)
}

/// Get a task by ID
#[tauri::command]
pub async fn get_task(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
) -> Result<TaskData, String> {
    debug!("Getting task: {}", task_id);

    let store = task_store.0.lock().unwrap();
    store
        .get_task(&task_id)
        .map_err(|e| e.to_string())
}

/// Get all tasks for a session
#[tauri::command]
pub async fn get_session_tasks(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
) -> Result<Vec<TaskData>, String> {
    debug!("Getting tasks for session: {}", session_id);

    let store = task_store.0.lock().unwrap();
    store
        .get_session_tasks(&session_id)
        .map_err(|e| e.to_string())
}

/// Get unfinished tasks for a session
#[tauri::command]
pub async fn get_unfinished_tasks(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
) -> Result<Vec<TaskData>, String> {
    debug!("Getting unfinished tasks for session: {}", session_id);

    let store = task_store.0.lock().unwrap();
    store
        .get_unfinished_tasks(&session_id)
        .map_err(|e| e.to_string())
}

/// Update task status
#[tauri::command]
pub async fn update_task_status(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
    status: String,
    error_message: Option<String>,
) -> Result<(), String> {
    debug!("Updating task status: {} -> {}", task_id, status);

    let status_enum = match status.as_str() {
        "pending" => TaskStatus::Pending,
        "in_progress" => TaskStatus::InProgress,
        "paused" => TaskStatus::Paused,
        "completed" => TaskStatus::Completed,
        "failed" => TaskStatus::Failed,
        "cancelled" => TaskStatus::Cancelled,
        _ => return Err("Invalid task status".to_string()),
    };

    let store = task_store.0.lock().unwrap();
    store
        .update_task_status(&task_id, status_enum, error_message)
        .map_err(|e| e.to_string())
}

/// Update task progress
#[tauri::command]
pub async fn update_task_progress(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
    transferred_size: u64,
    total_size: Option<u64>,
) -> Result<(), String> {
    debug!("Updating task progress: {}", task_id);

    let store = task_store.0.lock().unwrap();
    store
        .update_task_progress(&task_id, transferred_size, total_size)
        .map_err(|e| e.to_string())
}

/// Parameters for updating multipart upload info
#[derive(serde::Deserialize)]
pub struct MultipartUpdateParams {
    pub task_id: String,
    pub upload_id: String,
    pub bucket_name: String,
    pub key: String,
    pub part_number: i32,
    pub uploaded_size: u64,
    pub total_size: u64,
}

/// Update multipart upload info
#[tauri::command]
pub async fn update_multipart_info(
    task_store: State<'_, TaskStoreState>,
    params: MultipartUpdateParams,
) -> Result<(), String> {
    debug!("Updating multipart info for task: {}", params.task_id);

    let multipart_info = MultipartUploadInfo {
        upload_id: params.upload_id,
        bucket_name: params.bucket_name,
        key: params.key,
        part_number: params.part_number,
        completed_parts: Vec::new(), // This will be populated as parts complete
        total_size: params.total_size,
        uploaded_size: params.uploaded_size,
    };

    let store = task_store.0.lock().unwrap();
    store
        .update_multipart_info(&params.task_id, multipart_info)
        .map_err(|e| e.to_string())
}

/// Delete a task
#[tauri::command]
pub async fn delete_task(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
) -> Result<(), String> {
    debug!("Deleting task: {}", task_id);

    let store = task_store.0.lock().unwrap();
    store
        .delete_task(&task_id)
        .map_err(|e| e.to_string())
}

/// Delete all tasks for a session
#[tauri::command]
pub async fn delete_session_tasks(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
) -> Result<usize, String> {
    debug!("Deleting all tasks for session: {}", session_id);

    let store = task_store.0.lock().unwrap();
    store
        .delete_session_tasks(&session_id)
        .map_err(|e| e.to_string())
}

/// Get task statistics
#[tauri::command]
pub async fn get_task_stats(
    task_store: State<'_, TaskStoreState>,
    session_id: Option<String>,
) -> Result<TaskStats, String> {
    debug!("Getting task statistics");

    let store = task_store.0.lock().unwrap();
    store
        .get_task_stats(session_id.as_deref())
        .map_err(|e| e.to_string())
}

/// Clean up old completed tasks
#[tauri::command]
pub async fn cleanup_old_tasks(
    task_store: State<'_, TaskStoreState>,
    days: i64,
) -> Result<usize, String> {
    debug!("Cleaning up tasks older than {} days", days);

    let store = task_store.0.lock().unwrap();
    store
        .cleanup_old_tasks(days)
        .map_err(|e| e.to_string())
}

/// Increment retry count for a task
#[tauri::command]
pub async fn increment_task_retry(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
) -> Result<bool, String> {
    debug!("Incrementing retry count for task: {}", task_id);

    let store = task_store.0.lock().unwrap();
    store
        .increment_retry_count(&task_id)
        .map_err(|e| e.to_string())
}

/// Get tasks by status for a session
#[tauri::command]
pub async fn get_tasks_by_status(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
    status: String,
) -> Result<Vec<TaskData>, String> {
    debug!("Getting tasks with status {} for session: {}", status, session_id);

    let status_enum = match status.as_str() {
        "pending" => TaskStatus::Pending,
        "in_progress" => TaskStatus::InProgress,
        "paused" => TaskStatus::Paused,
        "completed" => TaskStatus::Completed,
        "failed" => TaskStatus::Failed,
        "cancelled" => TaskStatus::Cancelled,
        _ => return Err("Invalid task status".to_string()),
    };

    let store = task_store.0.lock().unwrap();
    store
        .get_tasks_by_status(&session_id, status_enum)
        .map_err(|e| e.to_string())
}

/// Check and recover unfinished tasks when connecting to a session
#[tauri::command]
pub async fn check_session_recovery(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    debug!("Checking session recovery for: {}", session_id);

    let store = task_store.0.lock().unwrap();

    // Get all unfinished tasks
    let unfinished_tasks = store
        .get_unfinished_tasks(&session_id)
        .map_err(|e| e.to_string())?;

    // Get pending tasks specifically
    let pending_tasks = store
        .get_tasks_by_status(&session_id, TaskStatus::Pending)
        .map_err(|e| e.to_string())?;

    // Get in-progress tasks
    let in_progress_tasks = store
        .get_tasks_by_status(&session_id, TaskStatus::InProgress)
        .map_err(|e| e.to_string())?;

    // Get paused tasks
    let paused_tasks = store
        .get_tasks_by_status(&session_id, TaskStatus::Paused)
        .map_err(|e| e.to_string())?;

    let recovery_info = serde_json::json!({
        "session_id": session_id,
        "has_unfinished_tasks": !unfinished_tasks.is_empty(),
        "total_unfinished": unfinished_tasks.len(),
        "pending_tasks": pending_tasks.len(),
        "in_progress_tasks": in_progress_tasks.len(),
        "paused_tasks": paused_tasks.len(),
        "unfinished_uploads": unfinished_tasks.iter()
            .filter(|task| matches!(task.task_type, TaskType::Upload { .. }))
            .count(),
        "unfinished_downloads": unfinished_tasks.iter()
            .filter(|task| matches!(task.task_type, TaskType::Download { .. }))
            .count(),
        "resumable_multipart_uploads": unfinished_tasks.iter()
            .filter(|task| task.multipart_info.is_some())
            .count(),
        "tasks": unfinished_tasks
    });

    info!("Session recovery check completed for {}: {} unfinished tasks found",
          session_id, unfinished_tasks.len());

    Ok(recovery_info)
}

/// Clean up orphaned remote uploads by comparing with local task store
#[tauri::command]
pub async fn check_orphaned_uploads(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
    remote_multipart_uploads: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    debug!("Checking for orphaned uploads in session: {}", session_id);

    let store = task_store.0.lock().unwrap();

    // Get all tasks with multipart upload info
    let tasks_with_multipart = store
        .get_session_tasks(&session_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|task| task.multipart_info.is_some())
        .collect::<Vec<_>>();

    let mut orphaned_uploads = Vec::new();
    let mut tracked_uploads = Vec::new();

    // Check each remote upload against local tasks
    let total_remote_uploads = remote_multipart_uploads.len();
    for remote_upload in &remote_multipart_uploads {
        let upload_id = remote_upload.get("upload_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let key = remote_upload.get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Check if this upload is tracked in our task store
        let is_tracked = tasks_with_multipart.iter().any(|task| {
            if let Some(ref multipart_info) = task.multipart_info {
                multipart_info.upload_id == upload_id && multipart_info.key == key
            } else {
                false
            }
        });

        if is_tracked {
            tracked_uploads.push(serde_json::json!({
                "upload_id": upload_id,
                "key": key,
                "status": "tracked"
            }));
        } else {
            orphaned_uploads.push(serde_json::json!({
                "upload_id": upload_id,
                "key": key,
                "status": "orphaned"
            }));
        }
    }

    let result = serde_json::json!({
        "session_id": session_id,
        "total_remote_uploads": total_remote_uploads,
        "tracked_uploads": tracked_uploads.len(),
        "orphaned_uploads": orphaned_uploads.len(),
        "orphaned_upload_list": orphaned_uploads,
        "tracked_upload_list": tracked_uploads
    });

    info!("Orphaned upload check completed for {}: {} orphaned out of {} total",
          session_id, orphaned_uploads.len(), total_remote_uploads);

    Ok(result)
}

/// Resume a paused or failed task
#[tauri::command]
pub async fn resume_task(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
) -> Result<(), String> {
    debug!("Resuming task: {}", task_id);

    let store = task_store.0.lock().unwrap();
    let task = store.get_task(&task_id).map_err(|e| e.to_string())?;

    // Only allow resuming paused or failed tasks
    match task.status {
        TaskStatus::Paused | TaskStatus::Failed => {
            store.update_task_status(&task_id, TaskStatus::Pending, None)
                .map_err(|e| e.to_string())?;
            info!("Task {} resumed and set to pending", task_id);
            Ok(())
        }
        _ => {
            Err(format!("Cannot resume task {} with status {:?}", task_id, task.status))
        }
    }
}

/// Pause an in-progress task
#[tauri::command]
pub async fn pause_task(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
) -> Result<(), String> {
    debug!("Pausing task: {}", task_id);

    let store = task_store.0.lock().unwrap();
    let task = store.get_task(&task_id).map_err(|e| e.to_string())?;

    // Only allow pausing in-progress or pending tasks
    match task.status {
        TaskStatus::InProgress | TaskStatus::Pending => {
            store.update_task_status(&task_id, TaskStatus::Paused, None)
                .map_err(|e| e.to_string())?;
            info!("Task {} paused", task_id);
            Ok(())
        }
        _ => {
            Err(format!("Cannot pause task {} with status {:?}", task_id, task.status))
        }
    }
}

/// Cancel a task
#[tauri::command]
pub async fn cancel_task(
    task_store: State<'_, TaskStoreState>,
    task_id: String,
) -> Result<(), String> {
    debug!("Cancelling task: {}", task_id);

    let store = task_store.0.lock().unwrap();
    store.update_task_status(&task_id, TaskStatus::Cancelled, Some("Cancelled by user".to_string()))
        .map_err(|e| e.to_string())?;

    info!("Task {} cancelled", task_id);
    Ok(())
}

/// Initialize session with comprehensive task and upload checking
/// This should be called when user enters/connects to a session
#[tauri::command]
pub async fn initialize_session_tasks(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    debug!("Initializing session tasks for: {}", session_id);

    let store = task_store.0.lock().unwrap();

    // 1. Get all unfinished tasks for this session
    let unfinished_tasks = store
        .get_unfinished_tasks(&session_id)
        .map_err(|e| e.to_string())?;

    // 2. Get all tasks with multipart upload info for this session
    let tasks_with_multipart = store
        .get_session_tasks(&session_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|task| task.multipart_info.is_some())
        .collect::<Vec<_>>();

    // Extract multipart upload info for comparison
    let local_multipart_uploads: Vec<_> = tasks_with_multipart
        .iter()
        .filter_map(|task| {
            task.multipart_info.as_ref().map(|info| {
                serde_json::json!({
                    "upload_id": info.upload_id,
                    "key": info.key,
                    "task_id": task.id,
                    "bucket_name": info.bucket_name
                })
            })
        })
        .collect();

    let initialization_result = serde_json::json!({
        "session_id": session_id,
        "unfinished_tasks": unfinished_tasks,
        "local_multipart_uploads": local_multipart_uploads,
        "requires_recovery_check": !unfinished_tasks.is_empty(),
        "requires_orphaned_check": !tasks_with_multipart.is_empty(),
        "total_unfinished": unfinished_tasks.len(),
        "total_local_multipart": local_multipart_uploads.len()
    });

    info!("Session {} initialized: {} unfinished tasks, {} multipart uploads tracked",
          session_id, unfinished_tasks.len(), local_multipart_uploads.len());

    Ok(initialization_result)
}

/// Clean up orphaned remote uploads automatically
/// This compares remote multipart uploads with local tasks and aborts orphaned ones
#[tauri::command]
pub async fn cleanup_orphaned_uploads_automatically(
    task_store: State<'_, TaskStoreState>,
    session_id: String,
    remote_multipart_uploads: Vec<serde_json::Value>,
    auto_cleanup: bool,
) -> Result<serde_json::Value, String> {
    debug!("Checking for orphaned uploads in session: {} (auto_cleanup: {})", session_id, auto_cleanup);

    let store = task_store.0.lock().unwrap();

    // Get all tasks with multipart upload info for this session
    let tasks_with_multipart = store
        .get_session_tasks(&session_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|task| task.multipart_info.is_some())
        .collect::<Vec<_>>();

    let mut orphaned_uploads = Vec::new();
    let mut tracked_uploads = Vec::new();
    let total_remote_uploads = remote_multipart_uploads.len();

    // Check each remote upload against local tasks
    for remote_upload in &remote_multipart_uploads {
        let upload_id = remote_upload.get("upload_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let key = remote_upload.get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Check if this upload is tracked in our task store
        let is_tracked = tasks_with_multipart.iter().any(|task| {
            if let Some(ref multipart_info) = task.multipart_info {
                multipart_info.upload_id == upload_id && multipart_info.key == key
            } else {
                false
            }
        });

        if is_tracked {
            tracked_uploads.push(serde_json::json!({
                "upload_id": upload_id,
                "key": key,
                "status": "tracked"
            }));
        } else {
            orphaned_uploads.push(serde_json::json!({
                "upload_id": upload_id,
                "key": key,
                "status": "orphaned",
                "initiated": remote_upload.get("initiated").cloned().unwrap_or_default(),
                "storage_class": remote_upload.get("storage_class").cloned().unwrap_or_default()
            }));
        }
    }

    let mut cleanup_results = Vec::new();

    // If auto_cleanup is enabled and we have orphaned uploads, clean them up
    if auto_cleanup && !orphaned_uploads.is_empty() {
        info!("Auto-cleaning {} orphaned uploads for session: {}", orphaned_uploads.len(), session_id);

        // Note: We return the orphaned uploads for the frontend to handle the actual cleanup
        // since we need to make the abort_multipart_upload calls through the storage service
        // This function just identifies the orphaned uploads
        cleanup_results = orphaned_uploads.clone();
    }

    let result = serde_json::json!({
        "session_id": session_id,
        "total_remote_uploads": total_remote_uploads,
        "tracked_uploads": tracked_uploads.len(),
        "orphaned_uploads": orphaned_uploads.len(),
        "orphaned_upload_list": orphaned_uploads,
        "tracked_upload_list": tracked_uploads,
        "auto_cleanup_enabled": auto_cleanup,
        "uploads_to_cleanup": cleanup_results
    });

    info!("Orphaned upload check completed for {}: {} orphaned out of {} total (auto_cleanup: {})",
          session_id, orphaned_uploads.len(), total_remote_uploads, auto_cleanup);

    Ok(result)
}