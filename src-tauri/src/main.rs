// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod clients;
mod security;
mod storage;
mod logging;

use clients::StorageService;
use security::KeyManager;
use storage::{SessionStore, SessionData, SessionStats};
use types::{StorageConfig, ListObjectsResponse, ObjectMetadata, PreSignedUrlResponse};

use std::sync::Mutex;
use tauri::State;
use tauri::Emitter; // for window.emit
use tauri;
use tauri_plugin_fs;
use tauri_plugin_dialog;
use tauri_plugin_shell;
use tauri_plugin_http;
use bytes::Bytes;
use tracing::{debug, error, info};

// Application state
type AppState = Mutex<Option<SessionStore>>;

/// Initialize the application state
#[tauri::command]
async fn initialize_app() -> Result<String, String> {
    info!("Initializing R2 Browser application");

    // Test key manager initialization
    match KeyManager::new() {
        Ok(key_manager) => {
            match key_manager.get_or_create_key_pair() {
                Ok(_) => {
                    info!("Encryption system initialized successfully");
                    Ok("Application initialized successfully".to_string())
                }
                Err(e) => {
                    error!("Failed to initialize encryption: {}", e);
                    Err(format!("Failed to initialize encryption: {}", e))
                }
            }
        }
        Err(e) => {
            error!("Failed to initialize key manager: {}", e);
            Err(format!("Failed to initialize key manager: {}", e))
        }
    }
}

/// Save a session configuration
#[tauri::command]
async fn save_session(
    app_state: State<'_, AppState>,
    session_id: String,
    config: StorageConfig,
) -> Result<(), String> {
    debug!("Saving session: {}", session_id);

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.save_session(&session_id, config)
        .map_err(|e| e.to_string())
}

/// Get all sessions
#[tauri::command]
async fn get_sessions(
    app_state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, StorageConfig>, String> {
    debug!("Getting all sessions");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.get_sessions()
        .map_err(|e| e.to_string())
}

/// Get detailed session data
#[tauri::command]
async fn get_session_data(
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionData, String> {
    debug!("Getting session data: {}", session_id);

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.get_session_data(&session_id)
        .map_err(|e| e.to_string())
}

/// Delete a session
#[tauri::command]
async fn delete_session(
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    debug!("Deleting session: {}", session_id);

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.delete_session(&session_id)
        .map_err(|e| e.to_string())
}

/// Update session metadata
#[tauri::command]
async fn update_session_metadata(
    app_state: State<'_, AppState>,
    session_id: String,
    name: Option<String>,
    is_favorite: Option<bool>,
    tags: Option<Vec<String>>,
) -> Result<(), String> {
    debug!("Updating session metadata: {}", session_id);

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.update_session_metadata(&session_id, name, is_favorite, tags)
        .map_err(|e| e.to_string())
}

/// Get session statistics
#[tauri::command]
async fn get_session_stats(
    app_state: State<'_, AppState>,
) -> Result<SessionStats, String> {
    debug!("Getting session statistics");

    let session_store = get_or_create_session_store(&app_state).await?;
    session_store.get_session_stats()
        .map_err(|e| e.to_string())
}

/// Test connection to storage service
#[tauri::command]
async fn test_connection(
    config: StorageConfig,
) -> Result<(), String> {
    debug!("Testing connection for config");

    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.test_connection().await
        .map_err(|e| e.to_string())
}

/// List objects in storage
#[tauri::command]
async fn list_objects(
    session_id: String,
    prefix: Option<String>,
    max_keys: Option<i32>,
    continuation_token: Option<String>,
) -> Result<ListObjectsResponse, String> {
    debug!("Listing objects for session: {} with prefix: {:?}", session_id, prefix);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.list_objects(prefix, max_keys, continuation_token).await
        .map_err(|e| e.to_string())
}

/// Upload an object
#[tauri::command]
async fn upload_object(
    session_id: String,
    key: String,
    file_path: String,
    content_type: Option<String>,
) -> Result<(), String> {
    debug!("Uploading object: {} from file: {}", key, file_path);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    // Read file from local filesystem
    let data = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    service.put_object(&key, Bytes::from(data), content_type.as_deref()).await
        .map_err(|e| e.to_string())
}

/// Upload an object from local file with progress (emits 'upload_progress' events)
#[tauri::command]
async fn upload_object_with_progress(
    window: tauri::Window,
    session_id: String,
    key: String,
    file_path: String,
    content_type: Option<String>,
    task_id: String,
) -> Result<(), String> {
    debug!("Uploading (progress) object: {} from file: {}", key, file_path);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service
        .upload_file_with_progress(&key, &file_path, content_type.as_deref(), &window, &task_id)
        .await
        .map_err(|e| e.to_string())
}

/// Download an object
#[tauri::command]
async fn download_object(
    session_id: String,
    key: String,
    save_path: String,
) -> Result<(), String> {
    debug!("Downloading object: {} to file: {}", key, save_path);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    let data = service.get_object(&key).await
        .map_err(|e| e.to_string())?;

    // Write to local filesystem
    std::fs::write(&save_path, data)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Delete an object
#[tauri::command]
async fn delete_object(
    session_id: String,
    key: String,
) -> Result<(), String> {
    debug!("Deleting object: {}", key);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.delete_object(&key).await
        .map_err(|e| e.to_string())
}

/// Copy an object
#[tauri::command]
async fn copy_object(
    session_id: String,
    source_key: String,
    dest_key: String,
) -> Result<(), String> {
    debug!("Copying object from {} to {}", source_key, dest_key);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.copy_object(&source_key, &dest_key).await
        .map_err(|e| e.to_string())
}

/// Move an object
#[tauri::command]
async fn move_object(
    session_id: String,
    source_key: String,
    dest_key: String,
) -> Result<(), String> {
    debug!("Moving object from {} to {}", source_key, dest_key);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.move_object(&source_key, &dest_key).await
        .map_err(|e| e.to_string())
}

/// Get object metadata
#[tauri::command]
async fn get_object_metadata(
    session_id: String,
    key: String,
) -> Result<ObjectMetadata, String> {
    debug!("Getting metadata for object: {}", key);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.get_object_metadata(&key).await
        .map_err(|e| e.to_string())
}

/// Generate presigned URL
#[tauri::command]
async fn generate_presigned_url(
    session_id: String,
    key: String,
    method: String,
    expires_in: u64,
) -> Result<PreSignedUrlResponse, String> {
    debug!("Generating presigned URL for object: {} (method: {})", key, method);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.generate_presigned_url(&key, &method, expires_in).await
        .map_err(|e| e.to_string())
}

/// Create a folder
#[tauri::command]
async fn create_folder(
    session_id: String,
    prefix: String,
) -> Result<(), String> {
    debug!("Creating folder: {}", prefix);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.create_folder(&prefix).await
        .map_err(|e| e.to_string())
}

/// Delete a folder
#[tauri::command]
async fn delete_folder(
    session_id: String,
    prefix: String,
) -> Result<(), String> {
    debug!("Deleting folder: {}", prefix);

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.delete_folder(&prefix).await
        .map_err(|e| e.to_string())
}

/// Delete multiple objects
#[tauri::command]
async fn delete_objects(
    session_id: String,
    keys: Vec<String>,
) -> Result<(), String> {
    debug!("Deleting {} objects", keys.len());

    let config = get_session_config(&session_id).await?;
    let service = StorageService::new(config).await
        .map_err(|e| e.to_string())?;

    service.delete_objects(keys).await
        .map_err(|e| e.to_string())
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

// Helper functions

/// Get or create session store
async fn get_or_create_session_store(app_state: &State<'_, AppState>) -> Result<SessionStore, String> {
    let mut state = app_state.lock().unwrap();

    if state.is_none() {
        info!("Creating new session store");
        let session_store = SessionStore::new()
            .map_err(|e| format!("Failed to create session store: {}", e))?;
        *state = Some(session_store);
    }

    // This is a bit of a hack to work around Rust's borrow checker
    // In a real implementation, you'd want to use Arc<Mutex<SessionStore>> or similar
    drop(state);

    match SessionStore::new() {
        Ok(store) => Ok(store),
        Err(e) => Err(format!("Failed to access session store: {}", e)),
    }
}

/// Get session configuration by ID
async fn get_session_config(session_id: &str) -> Result<StorageConfig, String> {
    let session_store = SessionStore::new()
        .map_err(|e| format!("Failed to create session store: {}", e))?;

    let sessions = session_store.get_sessions()
        .map_err(|e| format!("Failed to get sessions: {}", e))?;

    sessions.get(session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", session_id))
}

fn main() {
    // Initialize logging system first
    if let Err(e) = logging::init_logger(None) {
        eprintln!("Failed to initialize logger: {}", e);
        std::process::exit(1);
    }

    logging::log_startup_info();

    // Set up panic handler to log panics
    std::panic::set_hook(Box::new(|panic_info| {
        tracing::error!("Application panic: {}", panic_info);
    }));

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        // Forward OS-level file drop events to the frontend for reliable DnD across platforms
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::DragDrop(ev) => {
                    // Use crate-level DragDropEvent (Tauri v2) which mirrors Wry's events
                    use tauri::DragDropEvent as DDE;
                    match ev {
                        &DDE::Enter { ref paths, .. } => {
                            let paths: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
                            let _ = window.emit("tauri://file-drop-hover", paths);
                        }
                        &DDE::Over { .. } => { /* keep overlay visible */ }
                        &DDE::Drop { ref paths, .. } => {
                            let paths: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
                            let payload = serde_json::json!({ "paths": paths });
                            let _ = window.emit("tauri://file-drop", payload);
                        }
                        &DDE::Leave => { let _ = window.emit("tauri://file-drop-cancelled", ()); }
                        &_ => {}
                    }
                }
                _ => {}
            }
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            initialize_app,
            save_session,
            get_sessions,
            get_session_data,
            delete_session,
            update_session_metadata,
            get_session_stats,
            test_connection,
            list_objects,
            upload_object,
            upload_object_with_progress,
            download_object,
            delete_object,
            copy_object,
            move_object,
            get_object_metadata,
            generate_presigned_url,
            create_folder,
            delete_folder,
            delete_objects,
            generate_session_id,
            get_app_info,
            // window controls
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_is_maximized,
            window_start_dragging,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        tracing::error!("Failed to run Tauri application: {}", e);
        std::process::exit(1);
    }

    logging::log_shutdown_info();
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
fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}
