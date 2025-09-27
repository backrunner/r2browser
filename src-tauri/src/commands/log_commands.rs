use std::collections::HashMap;
use std::sync::OnceLock;
use crate::logging::{AsyncLogger, LogMessage};

static ASYNC_LOGGER: OnceLock<AsyncLogger> = OnceLock::new();

pub fn get_async_logger() -> &'static AsyncLogger {
    ASYNC_LOGGER.get_or_init(AsyncLogger::new)
}

#[tauri::command]
pub async fn log_message(
    level: String,
    target: String,
    message: String,
    metadata: Option<HashMap<String, serde_json::Value>>,
) -> Result<(), String> {
    let log_msg = LogMessage {
        level,
        target,
        message,
        metadata,
    };

    get_async_logger().log(log_msg);
    Ok(())
}