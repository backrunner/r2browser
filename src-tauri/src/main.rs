// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clients;
mod commands;
mod logging;
mod security;
mod storage;
mod transfer_control;
mod types;

use clients::StorageService;
use commands::{
    log_commands::log_message,
    profile_commands::*,
    system_commands::*,
    task_commands::*,
    updater_commands::{
        check_for_app_update, download_and_install_app_update, restart_after_update,
        PendingUpdateState,
    },
    TaskStoreState,
};
use security::{KeyManager, StorageSyncStatus};
use storage::{ProfileStore, SessionData, SessionStats, SessionStore, TaskStore};
use types::{ListObjectsResponse, ObjectMetadata, PreSignedUrlResponse, StorageConfig};

use bytes::Bytes;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Emitter; // for window.emit
use tauri::Manager; // for webview_windows
use tauri::State;
use tracing::{debug, error, info};

// Application state
type AppState = Mutex<Option<SessionStore>>;

// Profile store state
type ProfileStoreState = Mutex<Option<ProfileStore>>;

// Storage service cache: session_id -> StorageService
type ServiceCache = Mutex<HashMap<String, (StorageConfig, StorageService)>>;

/// Initialize the application state
#[tauri::command]
async fn initialize_app() -> Result<String, String> {
    info!("Initializing R2 Browser application");

    // Test key manager initialization
    match KeyManager::new() {
        Ok(key_manager) => match key_manager.get_or_create_key_pair() {
            Ok(_) => {
                info!("Encryption system initialized successfully");
                Ok("Application initialized successfully".to_string())
            }
            Err(e) => {
                error!("Failed to initialize encryption");
                Err(format!("Failed to initialize encryption: {}", e))
            }
        },
        Err(e) => {
            error!("Failed to initialize key manager");
            Err(format!("Failed to initialize key manager: {}", e))
        }
    }
}

/// Save a session configuration
#[tauri::command]
async fn save_session(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    config: StorageConfig,
) -> Result<(), String> {
    debug!("Saving session");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store
        .save_session(&session_id, config)
        .map_err(|e| e.to_string())?;

    service_cache.lock().unwrap().remove(&session_id);
    let _ = app.emit("sessions-changed", ());
    Ok(())
}

/// Get all sessions
#[tauri::command]
async fn get_sessions(
    app_state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, StorageConfig>, String> {
    debug!("Getting all sessions");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.get_sessions().map_err(|e| e.to_string())
}

/// Get detailed session data
#[tauri::command]
async fn get_session_data(
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionData, String> {
    debug!("Getting session data");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store
        .get_session_data(&session_id)
        .map_err(|e| e.to_string())
}

/// Get all detailed session data without mutating access stats
#[tauri::command]
async fn get_all_session_data(app_state: State<'_, AppState>) -> Result<Vec<SessionData>, String> {
    debug!("Getting all session data");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store
        .get_all_session_data()
        .map_err(|e| e.to_string())
}

/// Explicitly record that a session was opened/activated
#[tauri::command]
async fn record_session_access(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionData, String> {
    debug!("Recording session access");

    let session_store = get_or_create_session_store(&app_state).await?;
    let session = session_store
        .record_session_access(&session_id)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("sessions-changed", ());
    Ok(session)
}

/// Delete a session
#[tauri::command]
async fn delete_session(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
) -> Result<(), String> {
    debug!("Deleting session");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store
        .delete_session(&session_id)
        .map_err(|e| e.to_string())?;

    service_cache.lock().unwrap().remove(&session_id);
    let _ = app.emit("sessions-changed", ());
    Ok(())
}

/// Update session metadata
#[tauri::command]
async fn update_session_metadata(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
    name: Option<String>,
    is_favorite: Option<bool>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    debug!("Updating session metadata");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store
        .update_session_metadata(&session_id, name, is_favorite, tags)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("sessions-changed", ());
    Ok(())
}

/// Get session statistics
#[tauri::command]
async fn get_session_stats(app_state: State<'_, AppState>) -> Result<SessionStats, String> {
    debug!("Getting session statistics");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.get_session_stats().map_err(|e| e.to_string())
}

/// Test connection to storage service
#[tauri::command]
async fn test_connection(config: StorageConfig) -> Result<(), String> {
    debug!("Testing connection for config");

    let service = StorageService::new(config)
        .await
        .map_err(|e| e.to_string())?;

    service.test_connection().await.map_err(|e| e.to_string())
}

/// List objects in storage
#[tauri::command]
async fn list_objects(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    prefix: Option<String>,
    max_keys: Option<i32>,
    continuation_token: Option<String>,
) -> Result<ListObjectsResponse, String> {
    debug!("Listing objects for session");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .list_objects(prefix, max_keys, continuation_token)
        .await
        .map_err(|e| e.to_string())
}

/// List all objects under a prefix without delimiter pagination truncation
#[tauri::command]
async fn list_all_objects_with_prefix(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    prefix: String,
) -> Result<Vec<types::S3Object>, String> {
    debug!("Listing all objects for session");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;
    service
        .list_all_objects_with_prefix(&prefix)
        .await
        .map_err(|e| e.to_string())
}

/// Upload an object
#[tauri::command]
async fn upload_object(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    key: String,
    file_path: String,
    content_type: Option<String>,
) -> Result<(), String> {
    debug!("Uploading object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    // Read file from local filesystem
    let data = std::fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    service
        .put_object(&key, Bytes::from(data), content_type.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Upload an object from local file with progress (emits 'upload_progress' events)
#[tauri::command]
async fn upload_object_with_progress(
    task_store: State<'_, TaskStoreState>,
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    window: tauri::Window,
    session_id: String,
    key: String,
    file_path: String,
    content_type: Option<String>,
    task_id: String,
) -> Result<(), String> {
    debug!("Uploading (progress) object");
    let transfer = task_store.begin_transfer(&task_id, window.label(), None)?;
    let transfer_generation = transfer.generation;

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    let upload_result = service
        .upload_file_with_progress(
            &key,
            &file_path,
            content_type.as_deref(),
            &window,
            &task_id,
            transfer_generation,
        )
        .await
        .map_err(|e| e.to_string());

    upload_result.map(|_| ())
}

/// Download an object
#[tauri::command]
async fn download_object(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    key: String,
    save_path: String,
) -> Result<(), String> {
    debug!("Downloading object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    let data = service.get_object(&key).await.map_err(|e| e.to_string())?;

    // Write to local filesystem
    std::fs::write(&save_path, data).map_err(|e| format!("Failed to write file: {}", e))
}

/// Download an object with progress tracking and resume capability
#[tauri::command]
async fn download_object_with_progress(
    task_store: State<'_, TaskStoreState>,
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    window: tauri::Window,
    session_id: String,
    key: String,
    save_path: String,
    task_id: String,
    resume_from: Option<u64>,
) -> Result<(), String> {
    debug!("Downloading (progress) object");
    let transfer = task_store.begin_transfer(&task_id, window.label(), Some(&save_path))?;
    let transfer_generation = transfer.generation;

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    let download_result = service
        .download_file_with_progress(
            &key,
            &save_path,
            &window,
            &task_id,
            transfer_generation,
            resume_from,
        )
        .await
        .map_err(|e| e.to_string());

    download_result
}

/// Delete an object
#[tauri::command]
async fn delete_object(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    key: String,
) -> Result<(), String> {
    debug!("Deleting object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service.delete_object(&key).await.map_err(|e| e.to_string())
}

/// Copy an object
#[tauri::command]
async fn copy_object(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    source_key: String,
    dest_key: String,
) -> Result<(), String> {
    debug!("Copying object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .copy_object(&source_key, &dest_key)
        .await
        .map_err(|e| e.to_string())
}

/// Move an object
#[tauri::command]
async fn move_object(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    source_key: String,
    dest_key: String,
) -> Result<(), String> {
    debug!("Moving object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .move_object(&source_key, &dest_key)
        .await
        .map_err(|e| e.to_string())
}

/// Copy or move an object across different sessions.
#[tauri::command]
async fn transfer_object_between_sessions(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    source_session_id: String,
    source_key: String,
    target_session_id: String,
    target_key: String,
    delete_source: bool,
) -> Result<(), String> {
    debug!("Transferring object across sessions");

    let source_service =
        get_or_create_storage_service(&app_state, &service_cache, &source_session_id).await?;
    let target_service =
        get_or_create_storage_service(&app_state, &service_cache, &target_session_id).await?;

    if target_service
        .object_exists(&target_key)
        .await
        .map_err(|e| e.to_string())?
    {
        return Err(format!("Destination object already exists: {}", target_key));
    }

    let metadata = source_service
        .get_object_metadata(&source_key)
        .await
        .map_err(|e| e.to_string())?;
    let data = source_service
        .get_object(&source_key)
        .await
        .map_err(|e| e.to_string())?;

    target_service
        .put_object(&target_key, data, metadata.content_type.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    if delete_source {
        source_service
            .delete_object(&source_key)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Get object metadata
#[tauri::command]
async fn get_object_metadata(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    key: String,
) -> Result<ObjectMetadata, String> {
    debug!("Getting metadata for object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .get_object_metadata(&key)
        .await
        .map_err(|e| e.to_string())
}

/// Generate presigned URL
#[tauri::command]
async fn generate_presigned_url(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    key: String,
    method: String,
    expires_in: u64,
) -> Result<PreSignedUrlResponse, String> {
    debug!("Generating presigned URL for object");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .generate_presigned_url(&key, &method, expires_in)
        .await
        .map_err(|e| e.to_string())
}

/// Create a folder
#[tauri::command]
async fn create_folder(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    prefix: String,
) -> Result<(), String> {
    debug!("Creating folder");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .create_folder(&prefix)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a folder
#[tauri::command]
async fn delete_folder(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    prefix: String,
) -> Result<(), String> {
    debug!("Deleting folder");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .delete_folder(&prefix)
        .await
        .map_err(|e| e.to_string())
}

/// Delete multiple objects
#[tauri::command]
async fn delete_objects(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    keys: Vec<String>,
) -> Result<(), String> {
    debug!("Deleting {} objects", keys.len());

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .delete_objects(keys)
        .await
        .map_err(|e| e.to_string())
}

/// Abort a multipart upload
#[tauri::command]
async fn abort_multipart_upload(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
    key: String,
    upload_id: String,
) -> Result<(), String> {
    debug!("Aborting multipart upload");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .abort_multipart_upload(&key, &upload_id)
        .await
        .map_err(|e| e.to_string())
}

/// List active multipart uploads
#[tauri::command]
async fn list_multipart_uploads(
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    debug!("Listing multipart uploads for session");

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    service
        .list_multipart_uploads()
        .await
        .map_err(|e| e.to_string())
}

/// Resume a multipart upload
#[tauri::command]
async fn resume_multipart_upload(
    task_store: State<'_, TaskStoreState>,
    app_state: State<'_, AppState>,
    service_cache: State<'_, ServiceCache>,
    window: tauri::Window,
    session_id: String,
    key: String,
    local_path: String,
    upload_id: String,
    completed_parts: Vec<(i32, String, u64)>,
    task_id: String,
) -> Result<(), String> {
    debug!("Resuming multipart upload");
    let transfer = task_store.begin_transfer(&task_id, window.label(), None)?;
    let transfer_generation = transfer.generation;

    let service = get_or_create_storage_service(&app_state, &service_cache, &session_id).await?;

    let resume_result = service
        .resume_multipart_upload(
            &key,
            &local_path,
            &upload_id,
            completed_parts,
            &window,
            &task_id,
            transfer_generation,
        )
        .await
        .map_err(|e| e.to_string());

    resume_result
}

/// Generate a new session ID
#[tauri::command]
async fn generate_session_id() -> Result<String, String> {
    Ok(SessionStore::generate_session_id())
}

/// Get application info
#[tauri::command]
async fn get_app_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "name": "R2 Browser",
        "version": env!("CARGO_PKG_VERSION"),
        "description": "Modern file manager for Cloudflare R2 and S3-compatible storage",
        "encryption_enabled": true,
        "supported_providers": ["Cloudflare R2", "S3 Compatible"]
    }))
}

/// Get the current encrypted configuration storage sync status
#[tauri::command]
fn get_storage_sync_status() -> Result<StorageSyncStatus, String> {
    KeyManager::get_storage_sync_status().map_err(|e| e.to_string())
}

/// Update whether encrypted configuration should prefer iCloud-backed storage
#[tauri::command]
fn set_storage_sync_enabled(
    app: tauri::AppHandle,
    app_state: State<'_, AppState>,
    profile_store_state: State<'_, ProfileStoreState>,
    task_store_state: State<'_, TaskStoreState>,
    service_cache: State<'_, ServiceCache>,
    enabled: bool,
) -> Result<StorageSyncStatus, String> {
    let installation = task_store_state.2.lock().unwrap_or_else(|e| e.into_inner());
    if *installation || task_store_state.has_active_tasks() {
        return Err("Wait for active transfers and updates before changing storage sync.".into());
    }
    let task_stats = {
        let task_store = task_store_state.0.lock().unwrap();
        task_store
            .get_task_stats(None)
            .map_err(|e| format!("Failed to inspect active transfers: {}", e))?
    };

    if task_stats.active_tasks > 0 {
        return Err(
            "Please wait for active uploads or downloads to finish before changing storage sync settings."
                .to_string(),
        );
    }

    let status = KeyManager::set_icloud_sync_enabled(enabled).map_err(|e| e.to_string())?;

    *app_state.lock().unwrap() = None;
    *profile_store_state.lock().unwrap() = None;
    service_cache.lock().unwrap().clear();

    let mut task_store = task_store_state.0.lock().unwrap();
    *task_store = TaskStore::new().map_err(|e| {
        format!(
            "Failed to reload task store after updating storage sync: {}",
            e
        )
    })?;
    drop(task_store);
    task_store_state
        .1
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();

    info!(
        enabled = enabled,
        using_icloud = status.using_icloud_storage,
        "Updated encrypted configuration storage sync preference"
    );

    let _ = app.emit("storage-backend-changed", ());
    Ok(status)
}

// Helper functions

/// Get or create session store (singleton pattern)
async fn get_or_create_session_store(
    app_state: &State<'_, AppState>,
) -> Result<SessionStore, String> {
    let mut state = app_state.lock().unwrap();

    if state.is_none() {
        info!("Creating singleton session store instance");
        let session_store =
            SessionStore::new().map_err(|e| format!("Failed to create session store: {}", e))?;
        *state = Some(session_store);
    }

    // SessionStore is cheap to clone as it only contains a SecureStorage with a PathBuf and keys
    // Both SessionStore and SecureStorage use immutable RSA keys, so cloning is safe
    Ok(state.as_ref().unwrap().clone())
}

/// Get session configuration by ID (uses global singleton SessionStore)
async fn get_session_config_from_store(
    app_state: &State<'_, AppState>,
    session_id: &str,
) -> Result<StorageConfig, String> {
    let session_store = get_or_create_session_store(app_state).await?;

    let sessions = session_store
        .get_sessions()
        .map_err(|e| format!("Failed to get sessions: {}", e))?;

    sessions
        .get(session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", session_id))
}

/// Get or create cached storage service for a session
async fn get_or_create_storage_service(
    app_state: &State<'_, AppState>,
    service_cache: &State<'_, ServiceCache>,
    session_id: &str,
) -> Result<StorageService, String> {
    let config = get_session_config_from_store(app_state, session_id).await?;
    // A concurrently created client must never restore an invalidated configuration.
    {
        let cache = service_cache.lock().unwrap();
        if let Some((cached_config, service)) = cache.get(session_id) {
            if cached_config == &config {
                return Ok(service.clone());
            }
        }
    }

    // Not in cache, create new service
    debug!("Creating new storage service for session");
    let service = StorageService::new(config.clone())
        .await
        .map_err(|e| e.to_string())?;

    // Cache it
    {
        let mut cache = service_cache.lock().unwrap();
        cache.insert(session_id.to_string(), (config, service.clone()));
        debug!("Cached storage service for session");
    }

    Ok(service)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging system first
    if let Err(e) = logging::init_logger(None) {
        eprintln!("Failed to initialize logger: {}", e);
        std::process::exit(1);
    }

    logging::log_startup_info();

    // Initialize task store
    let task_store_state = TaskStoreState::new().map_err(|e| {
        tracing::error!("Failed to initialize task store");
        e
    })?;

    // Set up panic handler to log panics
    std::panic::set_hook(Box::new(|panic_info| {
        tracing::error!("Application panic: {}", panic_info);
    }));

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Forward OS-level file drop events to the frontend for reliable DnD across platforms
        .on_window_event(|window, event| {
            let tasks = window.state::<TaskStoreState>();
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if tasks.window_has_active_tasks(window.label())
                    || window
                        .state::<PendingUpdateState>()
                        .is_installing_in(window.label())
                {
                    api.prevent_close();
                    let _ = window.emit_to(window.label(), "window-close-blocked", ());
                }
            }
            if let tauri::WindowEvent::Destroyed = event {
                tasks.release_window(window.label());
                window
                    .state::<PendingUpdateState>()
                    .remove_window(window.label());
                let _ = window.app_handle().emit("task-owners-changed", ());
            }
            if let tauri::WindowEvent::DragDrop(ev) = event {
                // Use crate-level DragDropEvent (Tauri v2) which mirrors Wry's events
                use tauri::DragDropEvent as DDE;
                match *ev {
                    DDE::Enter { ref paths, .. } => {
                        let paths: Vec<String> = paths
                            .iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect();
                        let _ = window.emit_to(window.label(), "tauri://file-drop-hover", paths);
                    }
                    DDE::Over { .. } => { /* keep overlay visible */ }
                    DDE::Drop { ref paths, .. } => {
                        let paths: Vec<String> = paths
                            .iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect();
                        let payload = serde_json::json!({ "paths": paths });
                        let _ = window.emit_to(window.label(), "tauri://file-drop", payload);
                    }
                    DDE::Leave => {
                        let _ = window.emit_to(window.label(), "tauri://file-drop-cancelled", ());
                    }
                    _ => {}
                }
            }
        })
        .manage(AppState::default())
        .manage(ServiceCache::default())
        .manage(ProfileStoreState::default())
        .manage(task_store_state)
        .manage(PendingUpdateState::default())
        .invoke_handler(tauri::generate_handler![
            initialize_app,
            save_session,
            get_sessions,
            get_session_data,
            get_all_session_data,
            record_session_access,
            delete_session,
            update_session_metadata,
            get_session_stats,
            test_connection,
            list_objects,
            list_all_objects_with_prefix,
            upload_object,
            upload_object_with_progress,
            download_object,
            download_object_with_progress,
            delete_object,
            copy_object,
            move_object,
            transfer_object_between_sessions,
            get_object_metadata,
            generate_presigned_url,
            create_folder,
            delete_folder,
            delete_objects,
            abort_multipart_upload,
            list_multipart_uploads,
            resume_multipart_upload,
            generate_session_id,
            get_app_info,
            get_storage_sync_status,
            set_storage_sync_enabled,
            check_for_app_update,
            download_and_install_app_update,
            restart_after_update,
            // Task management commands
            create_task,
            get_task,
            get_session_tasks,
            get_unfinished_tasks,
            update_task_status,
            update_task_progress,
            update_multipart_info,
            delete_task,
            delete_session_tasks,
            get_task_stats,
            cleanup_old_tasks,
            increment_task_retry,
            get_tasks_by_status,
            check_session_recovery,
            check_orphaned_uploads,
            resume_task,
            prepare_task_resume,
            pause_task,
            cancel_task,
            initialize_session_tasks,
            cleanup_orphaned_uploads_automatically,
            // Logging commands
            log_message,
            // System commands
            get_download_folder,
            get_documents_folder,
            get_home_folder,
            // window controls
            window_minimize,
            window_toggle_maximize,
            window_close,
            finish_window_close,
            window_is_maximized,
            window_start_dragging,
            get_all_window_bounds,
            // Profile management commands
            get_profiles,
            create_profile,
            update_profile,
            delete_profile,
            list_buckets,
            get_bucket_cors,
            update_bucket_cors,
            delete_bucket,
            check_bucket_empty,
        ])
        .run(tauri::generate_context!());

    if let Err(_) = result {
        tracing::error!("Failed to run Tauri application");
        std::process::exit(1);
    }

    logging::log_shutdown_info();
    Ok(())
}
// Window controls for custom, borderless title bar
#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<bool, String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn finish_window_close(
    window: tauri::Window,
    tasks: State<'_, TaskStoreState>,
    updater: State<'_, PendingUpdateState>,
) -> Result<(), String> {
    if tasks.window_has_active_tasks(window.label()) || updater.is_installing_in(window.label()) {
        return Err("This window still has an active transfer or update.".into());
    }
    window.destroy().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// Window bounds information for tab merge detection
#[derive(serde::Serialize)]
pub struct WindowBounds {
    pub label: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBoundsResponse {
    pub windows: Vec<WindowBounds>,
    pub global_coordinates_supported: bool,
}

/// Get all window bounds for drop target detection during tab drag
#[tauri::command]
fn get_all_window_bounds(app: tauri::AppHandle) -> Result<WindowBoundsResponse, String> {
    let mut bounds_list = Vec::new();
    let mut global_coordinates_supported = true;

    for (label, window) in app.webview_windows() {
        if !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(true) {
            continue;
        }
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        // DOM screen coordinates use logical pixels at the client origin.
        let position = match window.inner_position() {
            Ok(position) => position,
            Err(error) => {
                global_coordinates_supported = false;
                tracing::warn!(
                    window = %label,
                    error = %error,
                    "Skipping window bounds lookup because global coordinates are unavailable"
                );
                continue;
            }
        };
        // Get outer size
        let size = match window.inner_size() {
            Ok(size) => size,
            Err(error) => {
                tracing::warn!(
                    window = %label,
                    error = %error,
                    "Skipping window bounds lookup because window size is unavailable"
                );
                continue;
            }
        };

        bounds_list.push(WindowBounds {
            label: label.to_string(),
            x: (position.x as f64 / scale).round() as i32,
            y: (position.y as f64 / scale).round() as i32,
            width: (size.width as f64 / scale).round() as u32,
            height: (size.height as f64 / scale).round() as u32,
        });
    }

    Ok(WindowBoundsResponse {
        windows: bounds_list,
        global_coordinates_supported,
    })
}
