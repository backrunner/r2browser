import { invoke } from '@tauri-apps/api/core'

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  level: LogLevel
  message: string
  target?: string
  timestamp?: Date
  metadata?: Record<string, unknown>
}

const SENSITIVE_KEY_RE = /(secret|accesskey|access_key|credential|token|password|authorization|url|path|folder|key|task|config|session|bucket|name|error|message|stack)/i
const SAFE_KEY_RE = /^(count|fileCount|pathCount|source|mode|status|operation|duration|progress|type)$/i

function redactPrimitive(key: string, value: unknown): unknown {
  if (/url/i.test(key)) {
    return '[redacted-url]'
  }
  return value == null ? value : '[redacted]'
}

function sanitizeMetadataValue(key: string, value: unknown, depth = 0): unknown {
  if (depth > 3) return '[redacted]'

  if (Array.isArray(value)) {
    if (SENSITIVE_KEY_RE.test(key) && !SAFE_KEY_RE.test(key)) {
      return `[redacted-list:${value.length}]`
    }
    return value.map((item) => sanitizeMetadataValue(key, item, depth + 1))
  }

  if (value && typeof value === 'object') {
    if (SENSITIVE_KEY_RE.test(key) && !SAFE_KEY_RE.test(key)) {
      return '[redacted-object]'
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitizeMetadataValue(childKey, childValue, depth + 1),
      ])
    )
  }

  if (SENSITIVE_KEY_RE.test(key) && !SAFE_KEY_RE.test(key)) {
    return redactPrimitive(key, value)
  }

  return value
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return metadata
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sanitizeMetadataValue(key, value),
    ])
  )
}

class Logger {
  private static instance: Logger
  private isEnabled = true

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
  }

  private async logToBackend(entry: LogEntry): Promise<void> {
    if (!this.isEnabled) return

    try {
      await invoke('log_message', {
        level: entry.level,
        target: entry.target || 'frontend',
        message: entry.message,
        metadata: entry.metadata,
      })
    } catch (error) {
      // Fallback to console if backend logging fails
      // eslint-disable-next-line no-console
      console.error('Failed to log to backend:', error)
    }
  }

  private logToConsole(entry: LogEntry): void {
    if (!this.isEnabled) return

    const timestamp = entry.timestamp || new Date()
    const prefix = `[${timestamp.toISOString()}] [${entry.level.toUpperCase()}]`
    const message = entry.target ? `${prefix} ${entry.target}: ${entry.message}` : `${prefix} ${entry.message}`

    switch (entry.level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        // eslint-disable-next-line no-console
        console.debug(message, entry.metadata || '')
        break
      case LogLevel.INFO:
        // eslint-disable-next-line no-console
        console.info(message, entry.metadata || '')
        break
      case LogLevel.WARN:
        // eslint-disable-next-line no-console
        console.warn(message, entry.metadata || '')
        break
      case LogLevel.ERROR:
        // eslint-disable-next-line no-console
        console.error(message, entry.metadata || '')
        break
    }
  }

  private async log(level: LogLevel, message: string, target?: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      level,
      message,
      target,
      timestamp: new Date(),
      metadata: sanitizeMetadata(metadata),
    }

    // Log to console immediately (non-blocking)
    this.logToConsole(entry)

    // Log to backend asynchronously (non-blocking)
    this.logToBackend(entry).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Backend logging failed:', error)
    })
  }

  async trace(message: string, target?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.TRACE, message, target, metadata)
  }

  async debug(message: string, target?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.DEBUG, message, target, metadata)
  }

  async info(message: string, target?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.INFO, message, target, metadata)
  }

  async warn(message: string, target?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.WARN, message, target, metadata)
  }

  async error(message: string, target?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.ERROR, message, target, metadata)
  }

  // Convenience methods for common patterns
  async logWithContext(level: LogLevel, message: string, context: Record<string, unknown>): Promise<void> {
    await this.log(level, message, undefined, context)
  }

  async logError(error: unknown, message?: string, target?: string): Promise<void> {
    const errorMessage = message || 'An error occurred'
    const metadata = {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }
    await this.log(LogLevel.ERROR, errorMessage, target, metadata)
  }

  // Method to log performance metrics
  async logPerformance(operation: string, duration: number, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.INFO, `Performance: ${operation} took ${duration}ms`, 'performance', {
      operation,
      duration,
      ...metadata,
    })
  }

  // Method to log user actions
  async logUserAction(action: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.INFO, `User action: ${action}`, 'user-action', metadata)
  }

  // Method to log API calls
  async logApiCall(method: string, url: string, status?: number, duration?: number, metadata?: Record<string, unknown>): Promise<void> {
    await this.log(LogLevel.INFO, `API ${method} - Status: ${status}`, 'api', {
      method,
      url,
      status,
      duration,
      ...metadata,
    })
  }
}

// Export singleton instance
export const logger = Logger.getInstance()

// Export convenience functions
export const trace = (message: string, target?: string, metadata?: Record<string, unknown>) =>
  logger.trace(message, target, metadata)

export const debug = (message: string, target?: string, metadata?: Record<string, unknown>) =>
  logger.debug(message, target, metadata)

export const info = (message: string, target?: string, metadata?: Record<string, unknown>) =>
  logger.info(message, target, metadata)

export const warn = (message: string, target?: string, metadata?: Record<string, unknown>) =>
  logger.warn(message, target, metadata)

export const error = (message: string, target?: string, metadata?: Record<string, unknown>) =>
  logger.error(message, target, metadata)

export const logError = (error: unknown, message?: string, target?: string) =>
  logger.logError(error, message, target)

export const logPerformance = (operation: string, duration: number, metadata?: Record<string, unknown>) =>
  logger.logPerformance(operation, duration, metadata)

export const logUserAction = (action: string, metadata?: Record<string, unknown>) =>
  logger.logUserAction(action, metadata)

export const logApiCall = (method: string, url: string, status?: number, duration?: number, metadata?: Record<string, unknown>) =>
  logger.logApiCall(method, url, status, duration, metadata)

// Development mode helpers
export const enableLogging = () => logger.setEnabled(true)
export const disableLogging = () => logger.setEnabled(false)
