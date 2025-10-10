import { FileItem, FilePreview } from '@/types'

/**
 * Determine the preview type for a file
 */
export function getPreviewType(file: FileItem): FilePreview['type'] {
  if (!file.contentType) {
    // Fall back to extension-based detection
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      return 'image'
    }
    if (ext && ['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(ext)) {
      return 'video'
    }
    if (ext && ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
      return 'audio'
    }
    if (ext && ['txt', 'md', 'json', 'xml', 'csv', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'sh', 'yaml', 'yml', 'toml'].includes(ext)) {
      return 'text'
    }
    if (ext === 'pdf') {
      return 'pdf'
    }
    return 'unknown'
  }

  // Use MIME type if available
  if (file.contentType.startsWith('image/')) return 'image'
  if (file.contentType.startsWith('video/')) return 'video'
  if (file.contentType.startsWith('audio/')) return 'audio'
  if (file.contentType.startsWith('text/') || file.contentType === 'application/json' || file.contentType === 'application/xml') return 'text'
  if (file.contentType === 'application/pdf') return 'pdf'

  return 'unknown'
}

/**
 * Check if a file is previewable
 */
export function isPreviewable(file: FileItem): boolean {
  if (file.type === 'folder') return false

  const previewType = getPreviewType(file)
  return previewType !== 'unknown'
}

/**
 * Get the language for syntax highlighting based on file extension
 */
export function getLanguageFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()

  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'sql': 'sql',
    'graphql': 'graphql',
    'dockerfile': 'docker',
    'txt': 'text',
  }

  return languageMap[ext || ''] || 'text'
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown size'

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
 * Check if text content is binary
 */
export function isBinaryContent(content: string): boolean {
  // Check for null bytes or other binary indicators
  // eslint-disable-next-line no-control-regex
  const binaryPattern = /[\x00-\x08\x0E-\x1F]/
  return binaryPattern.test(content.substring(0, 8000)) // Check first 8KB
}

/**
 * Get preview size limits based on file type
 */
export function getPreviewSizeLimit(previewType: FilePreview['type']): number {
  const limits: Record<FilePreview['type'], number> = {
    'text': 5 * 1024 * 1024, // 5MB for text files
    'image': 20 * 1024 * 1024, // 20MB for images
    'video': 100 * 1024 * 1024, // 100MB for videos
    'audio': 50 * 1024 * 1024, // 50MB for audio
    'pdf': 50 * 1024 * 1024, // 50MB for PDFs
    'unknown': 0,
  }

  return limits[previewType]
}

/**
 * Check if file size is within preview limits
 */
export function isFileSizePreviewable(file: FileItem): boolean {
  const previewType = getPreviewType(file)
  const sizeLimit = getPreviewSizeLimit(previewType)

  if (!file.size || sizeLimit === 0) return false

  return file.size <= sizeLimit
}
