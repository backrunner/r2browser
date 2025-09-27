# R2 Browser Logging System

## Overview

The R2 Browser now includes a comprehensive logging system with file rotation built using the `tracing` ecosystem. This provides structured logging with JSON output to files and human-readable output to console.

## Features

- **File Rotation**: Daily log rotation with configurable maximum file count (default: 10 files)
- **Structured Logging**: JSON format logs to files for easy parsing and analysis
- **Console Logging**: Human-readable format for development
- **Log Levels**: Configurable log levels for file and console output
- **Automatic Cleanup**: Removes old log files to maintain disk space
- **Cross-platform**: Works on Windows, macOS, and Linux

## Log Location

Logs are stored in platform-specific directories:

- **Windows**: `%APPDATA%\r2browser\logs\`
- **macOS**: `~/Library/Application Support/r2browser/logs/`
- **Linux**: `~/.config/r2browser/logs/`

## Log Format

### File Logs (JSON)
```json
{
  "timestamp": "2025-01-25T10:30:45.123456Z",
  "level": "INFO",
  "target": "r2browser::clients::aws_s3_client",
  "filename": "src/clients/aws_s3_client.rs",
  "line_number": 123,
  "message": "Successfully uploaded object: example.txt",
  "fields": {
    "key": "example.txt",
    "size": 1024
  }
}
```

### Console Logs (Human-readable)
```
2025-01-25T10:30:45.123456Z  INFO r2browser: Successfully uploaded object: example.txt
```

## Configuration

The logging system can be configured by modifying `LoggerConfig` in the `logging` module:

```rust
pub struct LoggerConfig {
    pub log_dir: PathBuf,           // Directory for log files
    pub max_files: usize,           // Maximum number of log files to keep
    pub file_name_prefix: String,   // Prefix for log file names
    pub console_level: Level,       // Console log level
    pub file_level: Level,          // File log level
}
```

Default configuration:
- **Log Directory**: Platform-specific config directory
- **Max Files**: 10
- **File Name Prefix**: "r2browser"
- **Console Level**: INFO
- **File Level**: DEBUG

## Environment Variables

You can control logging behavior using the `RUST_LOG` environment variable:

```bash
# Show debug logs for r2browser and info for all other crates
RUST_LOG=r2browser=debug,info

# Show only error logs
RUST_LOG=error

# Show trace logs for specific modules
RUST_LOG=r2browser::clients::aws_s3_client=trace
```

## Usage in Code

Use the `tracing` macros throughout the codebase:

```rust
use tracing::{debug, info, warn, error, trace};

// Simple logging
info!("Application started successfully");

// Structured logging with fields
info!(
    user_id = %user.id,
    session_id = %session.id,
    "User logged in"
);

// Error logging with context
error!(
    error = %e,
    file_path = %path.display(),
    "Failed to read configuration file"
);
```

## Log Levels

- **TRACE**: Very verbose debug information
- **DEBUG**: Debug information
- **INFO**: General information
- **WARN**: Warning messages
- **ERROR**: Error messages

## File Rotation

- Logs are rotated daily at midnight
- Old logs are automatically cleaned up when the maximum file count is exceeded
- Log files are named with the format: `r2browser.YYYY-MM-DD.log`

## Troubleshooting

### No logs appearing
- Check the `RUST_LOG` environment variable
- Verify the log directory exists and is writable
- Check console output for initialization errors

### Log files not rotating
- Ensure the application runs past midnight for daily rotation
- Check disk space availability
- Verify file permissions in the log directory

### Performance impact
- The logging system uses non-blocking writers to minimize performance impact
- File logging is asynchronous and shouldn't block application threads
- Adjust log levels in production to reduce verbosity if needed

## Development Tips

1. Use structured logging with fields for better searchability
2. Include relevant context in log messages (file paths, user IDs, etc.)
3. Use appropriate log levels to avoid spam
4. Consider the audience: debug logs for developers, info logs for operations
5. Don't log sensitive information (passwords, tokens, etc.)