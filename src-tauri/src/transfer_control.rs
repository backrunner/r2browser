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

pub fn begin_task_transfer(task_id: &str) -> u64 {
    let generation = NEXT_TRANSFER_GENERATION.fetch_add(1, Ordering::Relaxed);
    active_generation_registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(task_id.to_string(), generation);
    generation
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
    request_task_pause_for_generation(task_id, active_generation(task_id));
}

pub fn request_task_cancel(task_id: &str) {
    request_task_cancel_for_generation(task_id, active_generation(task_id));
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
