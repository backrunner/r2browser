use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;
use url::Url;

const UPDATE_DOWNLOAD_EVENT: &str = "app-update://download";

pub struct PendingUpdateState(pub Mutex<Option<Update>>);

impl Default for PendingUpdateState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub current_version: String,
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
    pub channel: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum UpdateDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

enum UpdateChannel {
    Stable,
    Beta,
}

impl UpdateChannel {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Beta => "beta",
        }
    }

    fn pointer_tag(&self) -> &'static str {
        match self {
            Self::Stable => "updater-stable",
            Self::Beta => "updater-beta",
        }
    }
}

impl TryFrom<&str> for UpdateChannel {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.trim().to_ascii_lowercase().as_str() {
            "stable" => Ok(Self::Stable),
            "beta" => Ok(Self::Beta),
            _ => Err(format!("Unsupported update channel: {value}")),
        }
    }
}

fn github_repository_slug() -> Result<&'static str, String> {
    const REPOSITORY: &str = env!("CARGO_PKG_REPOSITORY");

    let normalized = REPOSITORY
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git");

    normalized
        .strip_prefix("https://github.com/")
        .or_else(|| normalized.strip_prefix("http://github.com/"))
        .or_else(|| normalized.strip_prefix("git@github.com:"))
        .ok_or_else(|| format!("Unsupported repository URL for updater endpoints: {REPOSITORY}"))
}

fn updater_endpoint(channel: &UpdateChannel) -> Result<Url, String> {
    let repository = github_repository_slug()?;
    let url = format!(
        "https://github.com/{repository}/releases/download/{}/latest.json",
        channel.pointer_tag()
    );

    Url::parse(&url).map_err(|error| format!("Invalid updater endpoint {url}: {error}"))
}

fn format_update_date(update: &Update) -> Option<String> {
    update.date.and_then(|date| date.format(&Rfc3339).ok())
}

fn build_updater(
    app: &AppHandle,
    channel: &UpdateChannel,
) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .endpoints(vec![updater_endpoint(channel)?])
        .map_err(|error| format!("Failed to configure updater endpoint: {error}"))?
        .build()
        .map_err(|error| format!("Failed to build updater: {error}"))
}

#[tauri::command]
pub async fn check_for_app_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdateState>,
    channel: Option<String>,
) -> Result<Option<UpdateMetadata>, String> {
    let channel = UpdateChannel::try_from(channel.as_deref().unwrap_or("stable"))?;
    let updater = build_updater(&app, &channel)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("Failed to check for updates: {error}"))?;

    let metadata = update.as_ref().map(|update| UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        body: update.body.clone(),
        date: format_update_date(update),
        channel: channel.as_str().to_string(),
    });

    *pending_update.0.lock().unwrap() = update;

    Ok(metadata)
}

#[tauri::command]
pub async fn download_and_install_app_update(
    window: Window,
    pending_update: State<'_, PendingUpdateState>,
) -> Result<(), String> {
    let update = pending_update.0.lock().unwrap().clone().ok_or_else(|| {
        "No pending update is available. Run check_for_app_update first.".to_string()
    })?;

    let mut first_chunk = true;

    update
        .download_and_install(
            |chunk_length, content_length| {
                if first_chunk {
                    first_chunk = false;
                    let _ = window.emit(
                        UPDATE_DOWNLOAD_EVENT,
                        UpdateDownloadEvent::Started { content_length },
                    );
                }

                let _ = window.emit(
                    UPDATE_DOWNLOAD_EVENT,
                    UpdateDownloadEvent::Progress { chunk_length },
                );
            },
            || {
                let _ = window.emit(UPDATE_DOWNLOAD_EVENT, UpdateDownloadEvent::Finished);
            },
        )
        .await
        .map_err(|error| format!("Failed to download and install update: {error}"))?;

    *pending_update.0.lock().unwrap() = None;

    Ok(())
}
