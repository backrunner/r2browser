use tauri::command;
use std::path::PathBuf;

#[command]
pub fn get_download_folder() -> Result<String, String> {
    // Get the system download folder
    if let Some(download_dir) = dirs::download_dir() {
        Ok(download_dir.to_string_lossy().to_string())
    } else {
        Err("Could not determine download folder".to_string())
    }
}

#[command]
pub fn get_documents_folder() -> Result<String, String> {
    // Get the system documents folder
    if let Some(doc_dir) = dirs::document_dir() {
        Ok(doc_dir.to_string_lossy().to_string())
    } else {
        Err("Could not determine documents folder".to_string())
    }
}

#[command]
pub fn get_home_folder() -> Result<String, String> {
    // Get the user home folder
    if let Some(home_dir) = dirs::home_dir() {
        Ok(home_dir.to_string_lossy().to_string())
    } else {
        Err("Could not determine home folder".to_string())
    }
}
