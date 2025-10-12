// Updated types to match the Rust backend
export interface StorageConfig {
  type: 'r2' | 's3'
  // R2 specific fields
  account_id?: string
  // S3 specific fields
  endpoint?: string
  region?: string
  force_path_style?: boolean
  // Common fields
  access_key_id: string
  secret_access_key: string
  bucket_name: string
}

export interface SessionData {
  id: string
  name: string
  config: StorageConfig
  created_at: string
  last_accessed: string
  access_count: number
  is_favorite: boolean
  tags: string[]
}

export interface SessionStats {
  total_sessions: number
  recent_sessions: SessionSummary[]
  favorite_sessions: SessionSummary[]
}

export interface SessionSummary {
  id: string
  name: string
  provider_type: string
  last_accessed: string
  access_count: number
}

export interface S3Object {
  key: string
  size: number
  lastModified: string
  etag: string
  storageClass?: string
  contentType?: string
}

export interface S3ListResult {
  objects: S3Object[]
  commonPrefixes: string[]
  nextContinuationToken?: string
  isTruncated: boolean
}

export interface FileItem {
  name: string
  key: string
  type: 'file' | 'folder'
  size?: number
  lastModified?: Date
  contentType?: string
  selected?: boolean
}

export interface BreadcrumbItem {
  name: string
  path: string
}

export interface UploadProgress {
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

// Global upload queue item for real-time uploads (drag-drop or dialog)
export interface UploadTask {
  id: string
  name: string
  key: string
  type?: 'upload' | 'download' // Task type to differentiate in UI
  size: number
  loaded: number
  progress: number // 0-100
  speedBps: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
  startedAt?: number
  updatedAt?: number
}

export interface Session extends SessionData {
  // Session is now just an alias for SessionData for backward compatibility
  lastAccessed: Date // Add this for backward compatibility
}

export interface AppStore {
  sessions: SessionData[]
  currentSession: SessionData | null
  currentPath: string
  files: FileItem[]
  selectedFiles: string[]
  isLoading: boolean
  error: string | null
}

export interface FilePreview {
  type: 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'unknown'
  url?: string
  content?: string
  error?: string
}

// Backend task types to replace 'any' usage
export interface UploadTaskType {
  Upload: {
    local_path: string
    remote_key: string
  }
}

export interface DownloadTaskType {
  Download: {
    remote_key: string
    local_path: string
  }
}

export interface BackendTask {
  id: string
  session_id: string
  task_type: UploadTaskType | DownloadTaskType
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  progress: number
  error?: string
  error_message?: string
  created_at: string
  updated_at: string
  retry_count: number
  total_size?: number
  transferred_size?: number
  metadata?: Record<string, unknown> & { multipart_info?: MultipartInfo }
}

export interface SessionInitResult {
  session_id: string
  unfinished_tasks: BackendTask[]
  requires_recovery_check?: boolean
}

export interface MultipartUpload {
  upload_id: string
  key: string
  initiated: string
}

export interface CompletedMultipartPart {
  part_number: number
  etag: string
  size: number
}

export interface MultipartInfo {
  upload_id: string
  key: string
  bucket_name?: string
  completed_parts: CompletedMultipartPart[]
}

export interface OrphanedUploadCleanupResult {
  uploads_to_cleanup: MultipartUpload[]
  cleanup_results: {
    success: boolean
    upload_id: string
  }[]
}

export interface PresignedUrlResponse {
  url: string
}

export interface UploadProgressEvent {
  task_id: string
  upload_id: string
  uploaded: number
  total: number
  bytes_uploaded: number
  total_bytes: number
  speed_bps: number
}

export interface MultipartProgressEvent {
  task_id: string
  upload_id: string
  bucket_name: string
  key: string
  part_number: number
  etag: string
  part_size: number
  uploaded: number
  total: number
}

export interface DownloadProgressEvent {
  task_id: string
  downloaded: number
  total: number
  progress: number
}

export interface AppInfo {
  name: string
  version: string
  description?: string
  author?: string
  [key: string]: unknown
}

export interface FileDropPayload {
  paths: string[]
}
