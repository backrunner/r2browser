use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::clients::{BucketCorsConfig, CloudflareR2Client, ListBucketsResponse};
use crate::storage::ProfileStore;

type ProfileStoreState = Mutex<Option<ProfileStore>>;

async fn get_or_create_profile_store(
    state: &State<'_, ProfileStoreState>,
) -> Result<ProfileStore, String> {
    let mut store_guard = state.lock().unwrap();

    if store_guard.is_none() {
        let profile_store = ProfileStore::new()
            .map_err(|e| format!("Failed to initialize profile store: {}", e))?;
        *store_guard = Some(profile_store);
    }

    Ok(store_guard.as_ref().unwrap().clone())
}

#[tauri::command]
pub async fn get_profiles(
    profile_store: State<'_, ProfileStoreState>,
) -> Result<Vec<crate::storage::CloudflareProfile>, String> {
    let store = get_or_create_profile_store(&profile_store).await?;
    let profiles = store.get_profiles();
    let mut profile_list: Vec<_> = profiles.into_values().collect();

    // Sort by last_used descending (most recent first)
    profile_list.sort_by(|a, b| b.last_used.cmp(&a.last_used));

    Ok(profile_list)
}

#[tauri::command]
pub async fn create_profile(
    app: AppHandle,
    name: String,
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
    profile_store: State<'_, ProfileStoreState>,
) -> Result<String, String> {
    let store = get_or_create_profile_store(&profile_store).await?;
    let id = store
        .create_profile(name, account_id, access_key_id, secret_access_key)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("profiles-changed", ());
    Ok(id)
}

#[tauri::command]
pub async fn update_profile(
    app: AppHandle,
    profile_id: String,
    name: Option<String>,
    account_id: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
    profile_store: State<'_, ProfileStoreState>,
) -> Result<(), String> {
    let store = get_or_create_profile_store(&profile_store).await?;
    store
        .update_profile(
            &profile_id,
            name,
            account_id,
            access_key_id,
            secret_access_key,
        )
        .map_err(|e| e.to_string())?;
    let _ = app.emit("profiles-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn delete_profile(
    app: AppHandle,
    profile_id: String,
    profile_store: State<'_, ProfileStoreState>,
) -> Result<(), String> {
    let store = get_or_create_profile_store(&profile_store).await?;
    store
        .delete_profile(&profile_id)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("profiles-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn list_buckets(
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
) -> Result<ListBucketsResponse, String> {
    let client = CloudflareR2Client::new(&account_id, &access_key_id, &secret_access_key).await?;
    client.list_buckets().await
}

#[tauri::command]
pub async fn get_bucket_cors(
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
    bucket_name: String,
) -> Result<BucketCorsConfig, String> {
    let client = CloudflareR2Client::new(&account_id, &access_key_id, &secret_access_key).await?;
    client.get_bucket_cors(&bucket_name).await
}

#[tauri::command]
pub async fn update_bucket_cors(
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
    bucket_name: String,
    cors_config: BucketCorsConfig,
) -> Result<(), String> {
    let client = CloudflareR2Client::new(&account_id, &access_key_id, &secret_access_key).await?;
    client.update_bucket_cors(&bucket_name, cors_config).await
}

#[tauri::command]
pub async fn delete_bucket(
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
    bucket_name: String,
) -> Result<(), String> {
    let client = CloudflareR2Client::new(&account_id, &access_key_id, &secret_access_key).await?;
    client.delete_bucket(&bucket_name).await
}

#[tauri::command]
pub async fn check_bucket_empty(
    account_id: String,
    access_key_id: String,
    secret_access_key: String,
    bucket_name: String,
) -> Result<bool, String> {
    let client = CloudflareR2Client::new(&account_id, &access_key_id, &secret_access_key).await?;
    client.check_bucket_empty(&bucket_name).await
}
