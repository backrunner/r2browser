/**
 * Normalize a path for comparison (remove trailing slashes, handle empty paths)
 */
export function normalizePath(path: string | undefined): string {
  if (!path) return ''
  // Remove trailing slashes
  return path.replace(/\/+$/, '')
}

/**
 * Extract the folder path from a file key
 */
export function getFolderFromKey(key: string): string {
  const parts = key.split('/')
  parts.pop() // Remove the filename
  return normalizePath(parts.join('/'))
}

/**
 * Detect MIME type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase()

  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',

    // Videos
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',

    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'wma': 'audio/x-ms-wma',

    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Text
    'txt': 'text/plain',
    'md': 'text/markdown',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'ts': 'text/typescript',
    'jsx': 'text/jsx',
    'tsx': 'text/tsx',

    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',

    // Others
    'exe': 'application/x-msdownload',
    'apk': 'application/vnd.android.package-archive',
    'dmg': 'application/x-apple-diskimage',
  }

  return mimeTypes[extension || ''] || 'application/octet-stream'
}

/**
 * Get human-readable file type from MIME type or extension
 */
export function getFileTypeLabel(filename: string, contentType?: string): string {
  // Use provided contentType if available
  const mimeType = contentType || getContentTypeFromExtension(filename)

  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType.startsWith('text/')) return 'Text'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('word')) return 'Word Document'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Spreadsheet'
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'Presentation'
  if (mimeType === 'application/json') return 'JSON'
  if (mimeType === 'application/xml') return 'XML'
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar') || mimeType.includes('gzip')) return 'Archive'

  // Extract extension as fallback
  const extension = filename.split('.').pop()?.toUpperCase()
  if (extension && extension.length <= 4) {
    return `${extension} File`
  }

  return 'File'
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return 'Unknown size'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Format date to human-readable string
 */
export function formatDate(date?: Date | string): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
