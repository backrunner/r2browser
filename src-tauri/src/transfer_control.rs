use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferCancellationKind {
    Pause,
    Cancel,
}

static TRANSFER_CANCELLATIONS: OnceLock<Mutex<HashMap<(String, u64), TransferCancellationKind>>> =
    OnceLock::new();
static ACTIVE_TRANSFER_GENERATIONS: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
static NEXT_TRANSFER_GENERATION: AtomicU64 = AtomicU64::new(1);

fn cancellation_registry() -> &'static Mutex<HashMap<(String, u64), TransferCancellationKind>> {
    TRANSFER_CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_generation_registry() -> &'static Mutex<HashMap<String, u64>> {
    ACTIVE_TRANSFER_GENERATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// A transfer lease is released even when setup fails or its future is dropped.
pub struct TaskTransferGuard {
    task_id: String,
    pub generation: u64,
    destination: Option<std::path::PathBuf>,
}

static DOWNLOAD_DESTINATIONS: OnceLock<Mutex<HashMap<std::path::PathBuf, String>>> =
    OnceLock::new();

impl TaskTransferGuard {
    pub fn begin(task_id: &str, destination: Option<&str>) -> Result<Self, String> {
        let mut active = active_generation_registry()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if active.contains_key(task_id) {
            return Err(
                "This task is already running. Wait for it to stop before resuming.".into(),
            );
        }
        let destination = destination.map(|path| {
            let path = std::path::PathBuf::from(path);
            path.canonicalize().unwrap_or_else(|_| {
                path.parent()
                    .and_then(|parent| parent.canonicalize().ok())
                    .and_then(|parent| path.file_name().map(|name| parent.join(name)))
                    .unwrap_or(path)
            })
        });
        if let Some(path) = &destination {
            let mut destinations = DOWNLOAD_DESTINATIONS
                .get_or_init(|| Mutex::new(HashMap::new()))
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if destinations.contains_key(path) {
                return Err("Another download is writing to this file.".into());
            }
            destinations.insert(path.clone(), task_id.to_string());
        }
        let generation = NEXT_TRANSFER_GENERATION.fetch_add(1, Ordering::Relaxed);
        active.insert(task_id.to_string(), generation);
        Ok(Self {
            task_id: task_id.to_string(),
            generation,
            destination,
        })
    }
}

impl Drop for TaskTransferGuard {
    fn drop(&mut self) {
        // Remove the file lease before publishing the task as stopped.
        if let Some(path) = &self.destination {
            DOWNLOAD_DESTINATIONS
                .get_or_init(|| Mutex::new(HashMap::new()))
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(path);
        }
        clear_task_cancellation_for_generation(&self.task_id, self.generation);
    }
}

pub fn is_task_running(task_id: &str) -> bool {
    active_generation(task_id) != 0
}

fn active_generation(task_id: &str) -> u64 {
    active_generation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(task_id)
        .copied()
        .unwrap_or(0)
}

pub fn request_task_pause(task_id: &str) {
    let generation = active_generation(task_id);
    if generation != 0 {
        request_task_pause_for_generation(task_id, generation);
    }
}

pub fn request_task_cancel(task_id: &str) {
    let generation = active_generation(task_id);
    if generation != 0 {
        request_task_cancel_for_generation(task_id, generation);
    }
}

pub fn request_task_pause_for_generation(task_id: &str, generation: u64) {
    let mut registry = cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    registry.insert(
        (task_id.to_string(), generation),
        TransferCancellationKind::Pause,
    );
}

pub fn request_task_cancel_for_generation(task_id: &str, generation: u64) {
    let mut registry = cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    registry.insert(
        (task_id.to_string(), generation),
        TransferCancellationKind::Cancel,
    );
}

pub fn clear_task_cancellation_for_generation(task_id: &str, generation: u64) {
    let mut registry = cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    registry.remove(&(task_id.to_string(), generation));

    let mut active_registry = active_generation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if active_registry
        .get(task_id)
        .is_some_and(|active_generation| *active_generation == generation)
    {
        active_registry.remove(task_id);
    }
}

pub fn task_cancellation(task_id: &str, generation: u64) -> Option<TransferCancellationKind> {
    let registry = cancellation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    registry.get(&(task_id.to_string(), generation)).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_start_does_not_replace_cancellation_generation() -> Result<(), String> {
        let task = "test-duplicate-transfer";
        let lease = TaskTransferGuard::begin(task, None)?;
        request_task_pause(task);
        assert!(TaskTransferGuard::begin(task, None).is_err());
        assert_eq!(
            task_cancellation(task, lease.generation),
            Some(TransferCancellationKind::Pause)
        );
        let previous_generation = lease.generation;
        drop(lease);
        assert!(!is_task_running(task));
        let next = TaskTransferGuard::begin(task, None)?;
        assert_ne!(previous_generation, next.generation);
        assert_eq!(task_cancellation(task, next.generation), None);
        Ok(())
    }

    #[test]
    fn setup_error_releases_lease() -> Result<(), String> {
        let task = "test-transfer-setup-error";
        let failed_setup = || -> Result<(), String> {
            let _lease = TaskTransferGuard::begin(task, None)?;
            Err("setup failed".into())
        };
        assert!(failed_setup().is_err());
        assert!(!is_task_running(task));
        let _retry = TaskTransferGuard::begin(task, None)?;
        Ok(())
    }

    #[test]
    fn two_tasks_cannot_write_the_same_file() -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("download.bin");
        let alias = directory.path().join(".").join("download.bin");
        let first = TaskTransferGuard::begin("test-file-first", Some(&path.to_string_lossy()))?;
        assert!(
            TaskTransferGuard::begin("test-file-second", Some(&alias.to_string_lossy())).is_err()
        );
        drop(first);
        let _second = TaskTransferGuard::begin("test-file-second", Some(&path.to_string_lossy()))?;
        Ok(())
    }
}
