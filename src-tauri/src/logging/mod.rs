pub mod async_logger;

use std::fs;
use std::path::PathBuf;
use tracing::Level;
use tracing_subscriber::{
    fmt::{self, time::ChronoUtc},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};
use tracing_appender::{non_blocking, rolling};

pub use async_logger::{AsyncLogger, LogMessage};

/// Logger configuration
#[derive(Debug)]
pub struct LoggerConfig {
    pub log_dir: PathBuf,
    pub max_files: usize,
    pub file_name_prefix: String,
    pub console_level: Level,
    pub file_level: Level,
}

impl Default for LoggerConfig {
    fn default() -> Self {
        let log_dir = get_default_log_dir();
        Self {
            log_dir,
            max_files: 10,
            file_name_prefix: "r2browser".to_string(),
            console_level: Level::INFO,
            file_level: Level::DEBUG,
        }
    }
}

/// Initialize the logging system with file rotation and console output
pub fn init_logger(config: Option<LoggerConfig>) -> anyhow::Result<()> {
    let config = config.unwrap_or_default();

    // Ensure log directory exists
    if !config.log_dir.exists() {
        fs::create_dir_all(&config.log_dir)?;
    }

    // Clean up old log files to maintain max_files limit
    cleanup_old_logs(&config.log_dir, &config.file_name_prefix, config.max_files)?;

    // Create a rolling file appender that rotates daily
    let file_appender = rolling::daily(&config.log_dir, &config.file_name_prefix);
    let (file_writer, _guard) = non_blocking(file_appender);

    // Create console writer
    let (console_writer, _console_guard) = non_blocking(std::io::stdout());

    // Set up environment filter
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("r2browser=debug,info"));

    // Create file layer with structured JSON logging
    let file_layer = fmt::layer()
        .json()
        .with_timer(ChronoUtc::rfc_3339())
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        .with_level(true)
        .with_writer(file_writer);

    // Create console layer with human-readable format
    let console_layer = fmt::layer()
        .with_timer(ChronoUtc::rfc_3339())
        .with_target(false)
        .with_file(false)
        .with_line_number(false)
        .with_level(true)
        .with_writer(console_writer);

    // Initialize the global subscriber
    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .with(console_layer)
        .init();

    tracing::info!(
        log_dir = %config.log_dir.display(),
        max_files = config.max_files,
        console_level = ?config.console_level,
        file_level = ?config.file_level,
        "Logger initialized successfully"
    );

    // Store the guards to prevent them from being dropped
    std::mem::forget(_guard);
    std::mem::forget(_console_guard);

    Ok(())
}

/// Get the default log directory based on the operating system
fn get_default_log_dir() -> PathBuf {
    if let Some(mut dir) = dirs::config_dir() {
        dir.push("r2browser");
        dir.push("logs");
        dir
    } else {
        // Fallback to current directory if config dir is not available
        PathBuf::from("logs")
    }
}

/// Clean up old log files to maintain the maximum number of files
fn cleanup_old_logs(log_dir: &PathBuf, prefix: &str, max_files: usize) -> anyhow::Result<()> {
    if !log_dir.exists() {
        return Ok(());
    }

    let mut log_files = Vec::new();

    // Collect all log files matching our prefix
    for entry in fs::read_dir(log_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if filename.starts_with(prefix) && (filename.ends_with(".log") || filename.contains(".log.")) {
                    if let Ok(metadata) = entry.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            log_files.push((path, modified));
                        }
                    }
                }
            }
        }
    }

    // Sort by modification time (newest first)
    log_files.sort_by(|a, b| b.1.cmp(&a.1));

    // Remove excess files
    if log_files.len() > max_files {
        for (path, _) in log_files.iter().skip(max_files) {
            if let Err(e) = fs::remove_file(path) {
                tracing::warn!(
                    path = %path.display(),
                    error = %e,
                    "Failed to remove old log file"
                );
            } else {
                tracing::debug!(
                    path = %path.display(),
                    "Removed old log file"
                );
            }
        }
    }

    Ok(())
}

/// Log application startup information
pub fn log_startup_info() {
    tracing::info!(
        name = env!("CARGO_PKG_NAME"),
        version = env!("CARGO_PKG_VERSION"),
        description = env!("CARGO_PKG_DESCRIPTION"),
        "Application starting"
    );

    let rust_version = option_env!("RUSTC_VERSION").unwrap_or("unknown");
    tracing::info!(
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
        rust_version = rust_version,
        "System information"
    );
}

/// Log application shutdown information
pub fn log_shutdown_info() {
    tracing::info!("Application shutting down");
}

