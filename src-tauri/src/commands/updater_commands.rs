use crate::commands::task_commands::TaskStoreState;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;
use url::Url;

const UPDATE_DOWNLOAD_EVENT: &str = "app-update://download";

#[derive(Default)]
pub struct PendingUpdateState {
    updates: Mutex<HashMap<String, (String, Update)>>,
    operation: tokio::sync::Mutex<()>,
    installing: Mutex<Option<String>>,
    installed: AtomicBool,
}

impl PendingUpdateState {
    pub fn is_installing_in(&self, window: &str) -> bool {
        self.installing
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_deref()
            == Some(window)
    }
    pub fn remove_window(&self, window: &str) {
        self.updates
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(window);
    }
}

struct InstallationGuard<'a>(&'a PendingUpdateState, &'a TaskStoreState);
impl Drop for InstallationGuard<'_> {
    fn drop(&mut self) {
        *self.0.installing.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *self.1 .2.lock().unwrap_or_else(|e| e.into_inner()) = false;
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

#[derive(Clone, Copy)]
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

fn accepts_update(
    channel: &UpdateChannel,
    current: &semver::Version,
    remote: &semver::Version,
) -> bool {
    let prerelease = remote.pre.as_str();
    let beta = prerelease.strip_prefix("beta.").is_some_and(|number| {
        !number.is_empty()
            && number.bytes().all(|byte| byte.is_ascii_digit())
            && (number == "0" || !number.starts_with('0'))
    });
    remote > current
        && remote.build.is_empty()
        && (prerelease.is_empty() || (matches!(channel, UpdateChannel::Beta) && beta))
}

fn format_update_date(update: &Update) -> Option<String> {
    update.date.and_then(|date| date.format(&Rfc3339).ok())
}

fn build_updater(
    app: &AppHandle,
    channel: &UpdateChannel,
) -> Result<tauri_plugin_updater::Updater, String> {
    let selected_channel = *channel;
    app.updater_builder()
        .timeout(std::time::Duration::from_secs(30))
        .version_comparator(move |current, remote| {
            accepts_update(&selected_channel, &current, &remote.version)
        })
        .endpoints(vec![updater_endpoint(channel)?])
        .map_err(|error| format!("Failed to configure updater endpoint: {error}"))?
        .build()
        .map_err(|error| format!("Failed to build updater: {error}"))
}

#[tauri::command]
pub async fn check_for_app_update(
    window: Window,
    app: AppHandle,
    pending_update: State<'_, PendingUpdateState>,
    channel: Option<String>,
) -> Result<Option<UpdateMetadata>, String> {
    let _operation = pending_update
        .operation
        .try_lock()
        .map_err(|_| "An update operation is already in progress.")?;
    let channel = UpdateChannel::try_from(channel.as_deref().unwrap_or("stable"))?;
    pending_update
        .updates
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(window.label());
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

    let mut updates = pending_update
        .updates
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(update) = update {
        updates.insert(window.label().into(), (channel.as_str().into(), update));
    } else {
        updates.remove(window.label());
    }

    Ok(metadata)
}

#[tauri::command]
pub async fn download_and_install_app_update(
    window: Window,
    pending_update: State<'_, PendingUpdateState>,
    tasks: State<'_, TaskStoreState>,
    channel: String,
    expected_version: String,
) -> Result<(), String> {
    let _operation = pending_update
        .operation
        .try_lock()
        .map_err(|_| "An update operation is already in progress.")?;
    if pending_update.installed.load(Ordering::SeqCst) {
        return Err("An update is already installed. Restart the application.".into());
    }
    let (checked_channel, update) = pending_update
        .updates
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(window.label())
        .cloned()
        .ok_or_else(|| {
            "No pending update is available in this window. Check for updates again.".to_string()
        })?;
    if checked_channel != channel || update.version != expected_version {
        return Err("The selected update has changed. Check for updates again.".into());
    }
    {
        let mut installation = tasks.2.lock().unwrap_or_else(|e| e.into_inner());
        if tasks.has_active_tasks() {
            return Err(
                "Pause or cancel transfers in all windows before installing an update.".into(),
            );
        }
        *installation = true;
        *pending_update
            .installing
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(window.label().into());
    }
    let _installation = InstallationGuard(&pending_update, &tasks);

    let mut first_chunk = true;

    update
        .download_and_install(
            |chunk_length, content_length| {
                if first_chunk {
                    first_chunk = false;
                    let _ = window.emit_to(
                        window.label(),
                        UPDATE_DOWNLOAD_EVENT,
                        UpdateDownloadEvent::Started { content_length },
                    );
                }

                let _ = window.emit_to(
                    window.label(),
                    UPDATE_DOWNLOAD_EVENT,
                    UpdateDownloadEvent::Progress { chunk_length },
                );
            },
            || {
                let _ = window.emit_to(
                    window.label(),
                    UPDATE_DOWNLOAD_EVENT,
                    UpdateDownloadEvent::Finished,
                );
            },
        )
        .await
        .map_err(|error| format!("Failed to download and install update: {error}"))?;

    pending_update.installed.store(true, Ordering::SeqCst);
    pending_update
        .updates
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();

    Ok(())
}

#[tauri::command]
pub async fn restart_after_update(
    app: AppHandle,
    tasks: State<'_, TaskStoreState>,
    pending_update: State<'_, PendingUpdateState>,
) -> Result<(), String> {
    let _admission = tasks.2.lock().unwrap_or_else(|e| e.into_inner());
    if tasks.has_active_tasks() {
        return Err("Pause or cancel transfers in all windows before restarting.".into());
    }
    if !pending_update.installed.load(Ordering::SeqCst) {
        return Err("No installed update is ready to restart.".into());
    }
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channels_only_accept_newer_supported_versions() -> Result<(), semver::Error> {
        for (channel, current, remote, expected) in [
            (UpdateChannel::Stable, "1.0.0", "1.1.0-beta.1", false),
            (UpdateChannel::Beta, "1.0.0", "1.1.0-beta.1", true),
            (UpdateChannel::Beta, "1.1.0-beta.2", "1.1.0", true),
            (UpdateChannel::Stable, "1.1.0-beta.2", "1.0.0", false),
            (UpdateChannel::Beta, "1.1.0", "1.1.0-beta.9", false),
            (UpdateChannel::Beta, "1.0.0", "1.2.0-nightly.1", false),
            (UpdateChannel::Beta, "1.0.0", "1.2.0-beta.1.extra", false),
            (UpdateChannel::Stable, "1.0.0", "1.0.0", false),
        ] {
            assert_eq!(
                accepts_update(&channel, &current.parse()?, &remote.parse()?),
                expected
            );
        }
        Ok(())
    }
}
