use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::mpsc;
use tracing::{debug, error, info, trace, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogMessage {
    pub level: String,
    pub target: String,
    pub message: String,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

pub struct AsyncLogger {
    sender: mpsc::UnboundedSender<LogMessage>,
}

impl AsyncLogger {
    pub fn new() -> Self {
        let (sender, mut receiver) = mpsc::unbounded_channel::<LogMessage>();

        // Spawn a dedicated background task to handle log messages non-blocking
        tokio::spawn(async move {
            let mut buffer = Vec::with_capacity(100); // Buffer for batching log messages
            let mut last_flush = tokio::time::Instant::now();
            const FLUSH_INTERVAL: tokio::time::Duration = tokio::time::Duration::from_millis(100);
            const BUFFER_SIZE: usize = 50;

            loop {
                tokio::select! {
                    // Try to receive new log messages
                    result = receiver.recv() => {
                        match result {
                            Some(log_msg) => {
                                buffer.push(log_msg);

                                // Flush buffer if it's full or enough time has passed
                                if buffer.len() >= BUFFER_SIZE || last_flush.elapsed() >= FLUSH_INTERVAL {
                                    Self::flush_buffer(&mut buffer).await;
                                    last_flush = tokio::time::Instant::now();
                                }
                            }
                            None => {
                                // Channel closed, flush remaining messages and exit
                                if !buffer.is_empty() {
                                    Self::flush_buffer(&mut buffer).await;
                                }
                                break;
                            }
                        }
                    }

                    // Periodic flush to ensure messages don't stay buffered too long
                    _ = tokio::time::sleep(FLUSH_INTERVAL) => {
                        if !buffer.is_empty() && last_flush.elapsed() >= FLUSH_INTERVAL {
                            Self::flush_buffer(&mut buffer).await;
                            last_flush = tokio::time::Instant::now();
                        }
                    }
                }
            }
        });

        Self { sender }
    }

    pub fn log(&self, message: LogMessage) {
        // Non-blocking send - if channel is full, drop the message to prevent blocking
        if let Err(_) = self.sender.send(message) {
            // Channel is closed - this is expected behavior for non-blocking logging
            // We don't want to fallback to blocking operations here
        }
    }

    async fn flush_buffer(buffer: &mut Vec<LogMessage>) {
        for log_msg in buffer.drain(..) {
            Self::process_log_message(log_msg).await;
        }
    }

    async fn process_log_message(log_msg: LogMessage) {
        let target = log_msg.target.as_str();
        let message = log_msg.message.as_str();

        // Create tracing span with metadata if available
        let span = if let Some(metadata) = &log_msg.metadata {
            tracing::info_span!("frontend_log", target = target, ?metadata)
        } else {
            tracing::info_span!("frontend_log", target = target)
        };

        let _enter = span.enter();

        // Use tracing macros without dynamic target (which isn't supported)
        match log_msg.level.to_lowercase().as_str() {
            "trace" => trace!("{}: {}", target, message),
            "debug" => debug!("{}: {}", target, message),
            "info" => info!("{}: {}", target, message),
            "warn" => warn!("{}: {}", target, message),
            "error" => error!("{}: {}", target, message),
            _ => info!("{}: {}", target, message),
        }
    }
}

impl Default for AsyncLogger {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for AsyncLogger {
    fn drop(&mut self) {
        // Close the sender to signal the background task to shutdown
        // The background task will flush any remaining messages before exiting
    }
}
