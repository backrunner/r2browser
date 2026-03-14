import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import {
  StorageConfig,
  SessionData,
  SessionStats,
  UploadTask,
  BackendTask,
  SessionInitResult,
  MultipartUpload,
  OrphanedUploadCleanupResult,
  PresignedUrlResponse,
  UploadProgressEvent,
  MultipartProgressEvent,
  AppInfo,
  CloudflareProfile,
  BucketInfo,
  ListBucketsResponse,
  BucketCorsConfig,
} from '../types'
import { listen } from '@tauri-apps/api/event'
import { logger, logError } from '../lib/logger'
import { normalizePath, getFolderFromKey, getContentTypeFromExtension } from '../lib/file'

// Optional: dynamically import Tauri fs plugin for reading files from OS drops
let fsModulePromise: Promise<{ readFile: (p: string) => Promise<Uint8Array> } | null> | null = null
async function getFsModule() {
  if (!fsModulePromise) {
    fsModulePromise = import('@tauri-apps/plugin-fs')
      .then((m: { readFile: (p: string) => Promise<Uint8Array> }) => m)
      .catch(() => null)
  }
  return fsModulePromise
}

// Use types from the types file
interface FileItem {
  name: string
  key: string
  type: 'file' | 'folder'
  size?: number
  lastModified?: Date
  contentType?: string
}

interface ListObjectsResponse {
  objects: S3Object[]
  common_prefixes: string[]
  continuation_token?: string
  is_truncated: boolean
  prefix?: string
}

interface S3Object {
  key: string
  size: number
  last_modified: string
  etag: string
  storage_class?: string
  content_type?: string
  metadata?: Record<string, string>
}

const OBJECT_LIST_PAGE_SIZE = 1000
const BROWSER_UPLOAD_PATH_PREFIX = 'browser://'
let latestFileLoadRequestId = 0

function ensureFolderPrefix(path: string | undefined): string {
  const normalized = normalizePath(path)
  return normalized ? `${normalized}/` : ''
}

function joinObjectKey(basePath: string | undefined, name: string): string {
  return `${ensureFolderPrefix(basePath)}${name}`
}

function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(path)
}

function sortSessionsByLastAccessed(sessions: SessionData[]): SessionData[] {
  return [...sessions].sort(
    (left, right) => new Date(right.last_accessed).getTime() - new Date(left.last_accessed).getTime()
  )
}

async function listAllDirectoryPages(sessionId: string, prefix = ''): Promise<ListObjectsResponse> {
  const objects: S3Object[] = []
  const commonPrefixes = new Set<string>()
  let continuationToken: string | null = null

  do {
    const response: ListObjectsResponse = await invoke('list_objects', {
      sessionId,
      prefix: prefix || null,
      maxKeys: OBJECT_LIST_PAGE_SIZE,
      continuationToken,
    })

    objects.push(...response.objects)
    response.common_prefixes.forEach((commonPrefix: string) => commonPrefixes.add(commonPrefix))
    continuationToken = response.continuation_token ?? null
  } while (continuationToken)

  return {
    objects,
    common_prefixes: Array.from(commonPrefixes),
    continuation_token: continuationToken ?? undefined,
    is_truncated: false,
    prefix: prefix || undefined,
  }
}

async function listAllObjectsWithPrefix(sessionId: string, prefix: string): Promise<S3Object[]> {
  return invoke<S3Object[]>('list_all_objects_with_prefix', {
    sessionId,
    prefix,
  })
}

// Helper function: Extract filename from task data
function extractFileName(task: BackendTask): string {
  if ('Upload' in task.task_type) {
    return task.task_type.Upload.local_path.split(/[/\\]/).pop() || 'Unknown file'
  }
  if ('Download' in task.task_type) {
    return task.task_type.Download.remote_key.split('/').pop() || 'Unknown file'
  }
  return 'Unknown file'
}

// Helper function: Extract local path from task data
function extractLocalPath(task: BackendTask): string {
  if ('Upload' in task.task_type) {
    return task.task_type.Upload.local_path
  }
  if ('Download' in task.task_type) {
    return task.task_type.Download.local_path
  }
  return ''
}

// Helper function: Extract key from task data
function extractKey(task: BackendTask): string {
  if ('Upload' in task.task_type) {
    return task.task_type.Upload.remote_key
  }
  if ('Download' in task.task_type) {
    return task.task_type.Download.remote_key
  }
  return ''
}

// Helper function: Convert task status
function convertTaskStatus(status: string): 'pending' | 'uploading' | 'completed' | 'error' {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'pending'
    case 'in_progress':
    case 'inprogress':
      return 'uploading'
    case 'completed':
      return 'completed'
    case 'failed':
    case 'cancelled':
      return 'error'
    default:
      return 'pending'
  }
}

// Operation history types for undo/redo
type OperationType = 'rename' | 'move' | 'copy' | 'create_folder' | 'delete'

interface UndoableOperation {
  id: string
  type: OperationType
  timestamp: number
  description: string
  data: {
    rename?: { oldKey: string; newKey: string; oldName: string; newName: string }
    move?: Array<{ sourceKey: string; destKey: string }>
    copy?: { copiedKeys: string[]; entries?: Array<{ sourceKey: string; destKey: string }> }
    createFolder?: { folderKey: string }
    delete?: { deletedKeys: string[] } // Delete cannot be undone, just for history
  }
}

interface OperationHistory {
  past: UndoableOperation[]
  future: UndoableOperation[]
}

interface AppState {
  // Session management
  sessions: SessionData[]
  currentSession: SessionData | null
  sessionStats: SessionStats | null

  // Profile management
  profiles: CloudflareProfile[]
  currentProfile: CloudflareProfile | null
  profileBuckets: BucketInfo[]

  // Navigation state
  currentPath: string
  navigationHistory: string[]

  // File management state
  files: FileItem[]
  selectedFiles: string[]

  // Clipboard state
  clipboard: {
    files: FileItem[]
    operation: 'copy' | 'cut' | null
    sourceSessionId: string | null
    sourceConfig: StorageConfig | null
  }

  // UI state
  isLoading: boolean
  error: string | null
  searchQuery: string
  viewMode: 'list' | 'grid'
  sortBy: 'name' | 'size' | 'modified'
  sortOrder: 'asc' | 'desc'
  isSplitView: boolean

  // Application state
  isInitialized: boolean
  appInfo: AppInfo | null

  // Upload queue
  uploads: UploadTask[]
  recoveredTaskSessionIds: string[]
  recoveringTaskSessionIds: string[]

  // Operation history for undo/redo
  operationHistory: OperationHistory
}

interface AppActions {
  // Application initialization
  initializeApp: () => Promise<void>

  // Session management
  createSession: (config: StorageConfig) => Promise<string>
  loadSessions: () => Promise<void>
  loadSessionStats: () => Promise<void>
  recordSessionAccess: (sessionId: string) => Promise<void>
  setCurrentSession: (session: SessionData | null) => void
  updateSessionMetadata: (sessionId: string, updates: {
    name?: string
    is_favorite?: boolean
    tags?: string[]
  }) => Promise<void>
  removeSession: (sessionId: string) => Promise<void>
  testConnection: (config: StorageConfig) => Promise<boolean>

  // Profile management
  loadProfiles: () => Promise<void>
  createProfile: (profile: Omit<CloudflareProfile, 'id' | 'created_at' | 'last_used'>) => Promise<string>
  updateProfile: (profileId: string, profile: Partial<CloudflareProfile>) => Promise<void>
  deleteProfile: (profileId: string) => Promise<void>
  setCurrentProfile: (profile: CloudflareProfile | null) => void
  testProfileAndListBuckets: (accountId: string, accessKeyId: string, secretAccessKey: string) => Promise<BucketInfo[]>
  loadProfileBuckets: (profileId: string) => Promise<void>
  getBucketCors: (bucketName: string) => Promise<BucketCorsConfig>
  updateBucketCors: (bucketName: string, corsConfig: BucketCorsConfig) => Promise<void>
  deleteBucket: (bucketName: string) => Promise<void>
  checkBucketEmpty: (bucketName: string) => Promise<boolean>

  // Navigation
  setCurrentPath: (path: string) => void
  navigateToPath: (path: string) => Promise<void>
  goBack: () => void
  goUp: () => void

  // File operations
  loadFiles: (prefix?: string) => Promise<void>
  autoRecoverTasks: () => Promise<void>
  selectFile: (key: string) => void
  selectFiles: (keys: string[]) => void
  clearSelection: () => void
  deleteSelectedFiles: (skipRefresh?: boolean) => Promise<void>
  uploadFile: (key: string, filePath: string, contentType?: string) => Promise<void>
  downloadFile: (key: string, savePath: string) => Promise<void>
  copyObject: (sourceKey: string, destKey: string, skipRefresh?: boolean) => Promise<void>
  moveObject: (sourceKey: string, destKey: string, skipRefresh?: boolean) => Promise<void>
  copyPrefixContents: (sourcePrefix: string, targetPrefix: string, skipRefresh?: boolean) => Promise<string[]>
  movePrefixContents: (
    sourcePrefix: string,
    targetPrefix: string,
    skipRefresh?: boolean
  ) => Promise<Array<{ sourceKey: string; destKey: string }>>
  updateFileInList: (oldKey: string, newFile: Partial<FileItem> & { key: string }) => void
  removeFilesFromList: (keys: string[]) => void
  addFileToList: (file: FileItem) => void
  createFolder: (prefix: string) => Promise<void>
  deleteFolder: (prefix: string, skipRefresh?: boolean) => Promise<void>

  // Upload queue operations
  enqueueUploads: (files: File[], targetPath: string) => Promise<void>
  getActiveUploadCount: () => number
  enqueueUploadsFromPaths: (paths: string[], targetPath: string) => Promise<void>
  removeUpload: (id: string) => Promise<void>
  resumeUpload: (taskId: string) => Promise<void>
  pauseUpload: (taskId: string) => Promise<void>
  cancelUpload: (taskId: string) => Promise<void>

  // Clipboard operations
  copyFiles: (files: FileItem[]) => void
  cutFiles: (files: FileItem[]) => void
  pasteFiles: (targetPath: string) => Promise<void>
  clearClipboard: () => void
  hasClipboardContent: () => boolean

  // UI state management
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'grid') => void
  setSortBy: (sortBy: 'name' | 'size' | 'modified') => void
  setSortOrder: (order: 'asc' | 'desc') => void
  toggleSplitView: () => void

  // Utility functions
  generateSessionId: () => Promise<string>
  getAppInfo: () => Promise<AppInfo>

  // Operation history (undo/redo)
  pushOperation: (operation: Omit<UndoableOperation, 'id' | 'timestamp'>) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: () => boolean
  canRedo: () => boolean
  clearOperationHistory: () => void
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      currentSession: null,
      sessionStats: null,
      profiles: [],
      currentProfile: null,
      profileBuckets: [],
      currentPath: '',
      navigationHistory: [],
      files: [],
      selectedFiles: [],
      clipboard: {
        files: [],
        operation: null,
        sourceSessionId: null,
        sourceConfig: null,
      },
      isLoading: false,
      error: null,
      searchQuery: '',
      viewMode: 'list' as 'list' | 'grid',
      sortBy: 'name' as 'name' | 'size' | 'modified',
      sortOrder: 'asc' as 'asc' | 'desc',
      isSplitView: false,
      isInitialized: false,
      appInfo: null,
      uploads: [],
      recoveredTaskSessionIds: [],
      recoveringTaskSessionIds: [],
      operationHistory: {
        past: [],
        future: [],
      },

      // Application initialization
      initializeApp: async () => {
        try {
          set({ isLoading: true, error: null })

          // Initialize the Rust backend
          await invoke('initialize_app')

          // Load application info
          const appInfo = await invoke<AppInfo>('get_app_info')

          // Load existing sessions
          await get().loadSessions()
          await get().loadSessionStats()

          set({
            isInitialized: true,
            appInfo,
            isLoading: false
          })
        } catch (error) {
          await logError(error, 'Failed to initialize app', 'app-store')
          set({
            error: `Failed to initialize application: ${error}`,
            isLoading: false
          })
        }
      },

      // Session management
      createSession: async (config: StorageConfig) => {
        try {
          set({ isLoading: true, error: null })

          // Generate a new session ID
          const sessionId = await invoke<string>('generate_session_id')

          // Save the session
          await invoke('save_session', { sessionId, config })

          // Reload sessions to get the updated list
          await get().loadSessions()
          await get().loadSessionStats()

          set({ isLoading: false })
          return sessionId
        } catch (error) {
          await logError(error, 'Failed to create session', 'app-store')
          set({
            error: `Failed to create session: ${error}`,
            isLoading: false
          })
          throw error
        }
      },

      loadSessions: async () => {
        try {
          const sessions = await invoke<SessionData[]>('get_all_session_data')
          set({ sessions: sortSessionsByLastAccessed(sessions) })
        } catch (error) {
          await logError(error, 'Failed to load sessions', 'app-store')
          set({ error: `Failed to load sessions: ${error}` })
        }
      },

      recordSessionAccess: async (sessionId: string) => {
        try {
          const updatedSession = await invoke<SessionData>('record_session_access', { sessionId })

          set((state) => {
            const nextSessions = sortSessionsByLastAccessed(
              state.sessions.map((session) => (
                session.id === sessionId ? updatedSession : session
              ))
            )

            return {
              sessions: nextSessions,
              currentSession: state.currentSession?.id === sessionId ? updatedSession : state.currentSession,
            }
          })

          await get().loadSessionStats()
        } catch (error) {
          await logError(error, 'Failed to record session access', 'app-store')
        }
      },

      loadSessionStats: async () => {
        try {
          const sessionStats = await invoke<SessionStats>('get_session_stats')
          set({ sessionStats })
        } catch (error) {
          await logError(error, 'Failed to load session stats')
          // Don't set error for stats loading failure
        }
      },

      setCurrentSession: (session: SessionData | null) => {
        set({
          currentSession: session,
          currentPath: '',
          files: [],
          selectedFiles: [],
          navigationHistory: [],
        })
      },

      updateSessionMetadata: async (sessionId: string, updates) => {
        try {
          await invoke('update_session_metadata', {
            sessionId,
            name: updates.name || null,
            isFavorite: updates.is_favorite || null,
            tags: updates.tags || null,
          })

          // Reload sessions to get updated data
          await get().loadSessions()
          await get().loadSessionStats()
        } catch (error) {
          await logError(error, 'Failed to update session metadata')
          set({ error: `Failed to update session: ${error}` })
          throw error
        }
      },

      removeSession: async (sessionId: string) => {
        try {
          await invoke('delete_session', { sessionId })

          // Update local state
          const { sessions, currentSession } = get()
          const updatedSessions = sessions.filter(s => s.id !== sessionId)

          set({
            sessions: updatedSessions,
            currentSession: currentSession?.id === sessionId ? null : currentSession,
          })

          await get().loadSessionStats()
        } catch (error) {
          await logError(error, 'Failed to remove session')
          set({ error: `Failed to remove session: ${error}` })
          throw error
        }
      },

      testConnection: async (config: StorageConfig) => {
        try {
          await invoke('test_connection', { config })
          return true
        } catch (error) {
          await logError(error, 'Connection test failed')
          return false
        }
      },

      // Profile management
      loadProfiles: async () => {
        try {
          const profiles = await invoke<CloudflareProfile[]>('get_profiles')
          set({ profiles })
        } catch (error) {
          await logError(error, 'Failed to load profiles')
          set({ profiles: [] })
        }
      },

      createProfile: async (profile) => {
        try {
          const profileId = await invoke<string>('create_profile', {
            name: profile.name,
            accountId: profile.account_id,
            accessKeyId: profile.access_key_id,
            secretAccessKey: profile.secret_access_key,
          })
          await get().loadProfiles()
          return profileId
        } catch (error) {
          await logError(error, 'Failed to create profile')
          throw error
        }
      },

      updateProfile: async (profileId, profile) => {
        try {
          await invoke('update_profile', { profileId, ...profile })
          await get().loadProfiles()
        } catch (error) {
          await logError(error, 'Failed to update profile')
          throw error
        }
      },

      deleteProfile: async (profileId) => {
        try {
          await invoke('delete_profile', { profileId })
          const { profiles, currentProfile } = get()
          set({
            profiles: profiles.filter(p => p.id !== profileId),
            currentProfile: currentProfile?.id === profileId ? null : currentProfile,
            profileBuckets: currentProfile?.id === profileId ? [] : get().profileBuckets,
          })
        } catch (error) {
          await logError(error, 'Failed to delete profile')
          throw error
        }
      },

      setCurrentProfile: (profile) => {
        set({ currentProfile: profile, profileBuckets: [] })
        if (profile) {
          void get().loadProfileBuckets(profile.id).catch(() => undefined)
        }
      },

      testProfileAndListBuckets: async (accountId, accessKeyId, secretAccessKey) => {
        try {
          const response = await invoke<ListBucketsResponse>('list_buckets', {
            accountId,
            accessKeyId,
            secretAccessKey,
          })
          return response.buckets
        } catch (error) {
          await logError(error, 'Failed to list buckets')
          throw error
        }
      },

      loadProfileBuckets: async (profileId) => {
        try {
          const profile = get().profiles.find(p => p.id === profileId)
          if (!profile) throw new Error('Profile not found')

          const response = await invoke<ListBucketsResponse>('list_buckets', {
            accountId: profile.account_id,
            accessKeyId: profile.access_key_id,
            secretAccessKey: profile.secret_access_key,
          })
          set({ profileBuckets: response.buckets })
        } catch (error) {
          await logError(error, 'Failed to load profile buckets')
          set({ profileBuckets: [] })
          throw error
        }
      },

      getBucketCors: async (bucketName) => {
        try {
          const { currentProfile } = get()
          if (!currentProfile) throw new Error('No profile selected')

          const cors = await invoke<BucketCorsConfig>('get_bucket_cors', {
            accountId: currentProfile.account_id,
            accessKeyId: currentProfile.access_key_id,
            secretAccessKey: currentProfile.secret_access_key,
            bucketName,
          })
          return cors
        } catch (error) {
          await logError(error, 'Failed to get bucket CORS')
          throw error
        }
      },

      updateBucketCors: async (bucketName, corsConfig) => {
        try {
          const { currentProfile } = get()
          if (!currentProfile) throw new Error('No profile selected')

          await invoke('update_bucket_cors', {
            accountId: currentProfile.account_id,
            accessKeyId: currentProfile.access_key_id,
            secretAccessKey: currentProfile.secret_access_key,
            bucketName,
            corsConfig,
          })
        } catch (error) {
          await logError(error, 'Failed to update bucket CORS')
          throw error
        }
      },

      deleteBucket: async (bucketName) => {
        try {
          const { currentProfile } = get()
          if (!currentProfile) throw new Error('No profile selected')

          await invoke('delete_bucket', {
            accountId: currentProfile.account_id,
            accessKeyId: currentProfile.access_key_id,
            secretAccessKey: currentProfile.secret_access_key,
            bucketName,
          })

          // Reload buckets after deletion
          await get().loadProfileBuckets(currentProfile.id)
        } catch (error) {
          await logError(error, 'Failed to delete bucket')
          throw error
        }
      },

      checkBucketEmpty: async (bucketName) => {
        try {
          const { currentProfile } = get()
          if (!currentProfile) throw new Error('No profile selected')

          const isEmpty = await invoke<boolean>('check_bucket_empty', {
            accountId: currentProfile.account_id,
            accessKeyId: currentProfile.access_key_id,
            secretAccessKey: currentProfile.secret_access_key,
            bucketName,
          })
          return isEmpty
        } catch (error) {
          await logError(error, 'Failed to check if bucket is empty')
          throw error
        }
      },

      // Navigation
      setCurrentPath: (path: string) => {
        const normalizedPath = normalizePath(path)
        const { navigationHistory } = get()
        const newHistory = navigationHistory[navigationHistory.length - 1] === normalizedPath
          ? navigationHistory
          : [...navigationHistory, normalizedPath]
        set({
          currentPath: normalizedPath,
          selectedFiles: [],
          navigationHistory: newHistory.slice(-50) // Keep last 50 entries
        })
      },

      navigateToPath: async (path: string) => {
        const normalizedPath = normalizePath(path)
        get().setCurrentPath(normalizedPath)
        await get().loadFiles(normalizedPath)
      },

      goBack: () => {
        const { navigationHistory } = get()
        if (navigationHistory.length > 1) {
          const newHistory = navigationHistory.slice(0, -1)
          const previousPath = newHistory[newHistory.length - 1] || ''
          set({
            currentPath: previousPath,
            navigationHistory: newHistory,
            selectedFiles: []
          })
          get().loadFiles(previousPath)
        }
      },

      goUp: async () => {
        const { currentPath } = get()
        const pathParts = currentPath.split('/').filter(Boolean)
        if (pathParts.length > 0) {
          pathParts.pop()
          const newPath = pathParts.join('/')
          await get().navigateToPath(newPath)
        }
      },

      // File operations
      loadFiles: async (prefix = '') => {
        const { currentSession } = get()
        if (!currentSession) return

        const sessionId = currentSession.id
        const normalizedPrefix = normalizePath(prefix)
        const requestPrefix = ensureFolderPrefix(normalizedPrefix)
        const requestId = ++latestFileLoadRequestId

        set({ isLoading: true, error: null })

        try {
          const response = await listAllDirectoryPages(sessionId, requestPrefix)

          // Process objects into file items
          const fileMap = new Map<string, FileItem>()
          const prefixLength = requestPrefix.length

          // Add folders from common prefixes
          for (const commonPrefix of response.common_prefixes) {
            const folderName = commonPrefix.substring(prefixLength).replace(/\/$/, '')
            if (folderName) {
              fileMap.set(commonPrefix, {
                name: folderName,
                key: commonPrefix,
                type: 'folder',
              })
            }
          }

          // Add files (filter out placeholder objects like ".folder")
          for (const obj of response.objects) {
            const relativePath = obj.key.substring(prefixLength)
            const pathParts = relativePath.split('/')

            if (pathParts.length === 1 && relativePath) {
              // Skip placeholder used to represent empty folders
              if (relativePath === '.folder') {
                continue
              }
              // This is a file in current directory
              fileMap.set(obj.key, {
                name: relativePath,
                key: obj.key,
                type: 'file',
                size: obj.size,
                lastModified: new Date(obj.last_modified),
                contentType: obj.content_type,
              })
            } else if (pathParts.length > 1) {
              // This is inside a subfolder
              const folderName = pathParts[0]
              const folderKey = `${requestPrefix}${folderName}/`

              if (!fileMap.has(folderKey)) {
                fileMap.set(folderKey, {
                  name: folderName,
                  key: folderKey,
                  type: 'folder',
                })
              }
            }
          }

          const files = Array.from(fileMap.values())

          // Sort files
          const { sortBy, sortOrder } = get()
          files.sort((a, b) => {
            // Folders first
            if (a.type !== b.type) {
              return a.type === 'folder' ? -1 : 1
            }

            let comparison = 0
            switch (sortBy) {
              case 'name':
                comparison = a.name.localeCompare(b.name)
                break
              case 'size':
                comparison = (a.size || 0) - (b.size || 0)
                break
              case 'modified':
                comparison = (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0)
                break
            }

            return sortOrder === 'asc' ? comparison : -comparison
          })

          const state = get()
          const shouldApplyResult =
            requestId === latestFileLoadRequestId &&
            state.currentSession?.id === sessionId &&
            normalizePath(state.currentPath) === normalizedPrefix

          if (shouldApplyResult) {
            set({ files, isLoading: false })
          }
        } catch (error) {
          const state = get()
          const shouldApplyError =
            requestId === latestFileLoadRequestId &&
            state.currentSession?.id === sessionId

          if (!shouldApplyError) {
            return
          }

          await logError(error, 'Failed to load files')
          set({ error: `Failed to load files: ${error}`, isLoading: false })
        }
      },

      autoRecoverTasks: async () => {
        const {
          currentSession,
          recoveredTaskSessionIds,
          recoveringTaskSessionIds,
        } = get()
        if (!currentSession) return
        if (
          recoveredTaskSessionIds.includes(currentSession.id) ||
          recoveringTaskSessionIds.includes(currentSession.id)
        ) {
          return
        }

        set((state) => ({
          recoveringTaskSessionIds: [...state.recoveringTaskSessionIds, currentSession.id],
        }))

        try {
          await logger.info(`Starting automatic task recovery for session: ${currentSession.id}`)

          // 1. Initialize session task check
          const initResult = await invoke<SessionInitResult>('initialize_session_tasks', {
            sessionId: currentSession.id
          })

          await logger.debug('Session initialization result', 'app-store', { initResult })

          // 2. Get remote multipart uploads
          let remoteUploads: MultipartUpload[] = []
          try {
            remoteUploads = await invoke<MultipartUpload[]>('list_multipart_uploads', {
              sessionId: currentSession.id
            })
            await logger.info(`Found ${remoteUploads.length} remote multipart uploads`)
          } catch (error) {
            await logger.warn('Failed to list remote multipart uploads', 'app-store', { error: error instanceof Error ? error.message : String(error) })
          }

          // 3. Check and auto-cleanup orphaned uploads
          if (remoteUploads.length > 0) {
            const cleanupResult = await invoke<OrphanedUploadCleanupResult>('cleanup_orphaned_uploads_automatically', {
              sessionId: currentSession.id,
              remoteMultipartUploads: remoteUploads,
              autoCleanup: true // Auto cleanup enabled
            })

            await logger.debug('Orphaned upload cleanup result', 'app-store', { cleanupResult })

            // 4. Execute actual cleanup operations
            if (cleanupResult.uploads_to_cleanup && cleanupResult.uploads_to_cleanup.length > 0) {
              await logger.info(`Auto-cleaning ${cleanupResult.uploads_to_cleanup.length} orphaned uploads`)

              const cleanupPromises = cleanupResult.uploads_to_cleanup.map(async (upload: MultipartUpload) => {
                try {
                  await invoke('abort_multipart_upload', {
                    sessionId: currentSession.id,
                    key: upload.key,
                    uploadId: upload.upload_id
                  })
                  return { success: true, upload_id: upload.upload_id }
                } catch (error) {
                  await logError(error, `Failed to abort orphaned upload ${upload.upload_id}`)
                  return { success: false, upload_id: upload.upload_id }
                }
              })

              await Promise.allSettled(cleanupPromises)
            }
          }

          // 5. Auto-load unfinished tasks to task list if they exist
          if (initResult.requires_recovery_check && initResult.unfinished_tasks.length > 0) {
            await logger.info(`Found ${initResult.unfinished_tasks.length} unfinished tasks, adding to task queue`)

            // Convert unfinished tasks to UploadTask format and add to queue
            const recoveredTasks: UploadTask[] = []

            for (const task of initResult.unfinished_tasks) {
              // Create corresponding task item based on task type
              const uploadTask: UploadTask = {
                id: task.id,
                name: extractFileName(task),
                key: extractKey(task),
                size: task.total_size || 0,
                loaded: task.transferred_size || 0,
                progress: task.progress || 0,
                speedBps: 0,
                status: convertTaskStatus(task.status),
                startedAt: new Date(task.created_at).getTime(),
                updatedAt: new Date(task.updated_at).getTime(),
              }

              // Add error message if task has error
              if (task.error_message) {
                uploadTask.error = task.error_message
              }

              recoveredTasks.push(uploadTask)
              await logger.info(`Recovered task: ${task.id} (${task.task_type}) - Progress: ${task.progress}%`)
            }

            // Add recovered tasks to uploads queue
            if (recoveredTasks.length > 0) {
              set((state) => ({
                uploads: [
                  ...state.uploads,
                  ...recoveredTasks.filter((task) => !state.uploads.some((upload) => upload.id === task.id)),
                ],
              }))
              await logger.info(`Added ${recoveredTasks.length} recovered tasks to upload queue`)
            }
          }

          await logger.info('Automatic task recovery completed successfully')
          set((state) => ({
            recoveredTaskSessionIds: state.recoveredTaskSessionIds.includes(currentSession.id)
              ? state.recoveredTaskSessionIds
              : [...state.recoveredTaskSessionIds, currentSession.id],
          }))
        } catch (error) {
          await logError(error, 'Automatic task recovery failed')
          // Don't show error to user since this is background operation
        } finally {
          set((state) => ({
            recoveringTaskSessionIds: state.recoveringTaskSessionIds.filter((sessionId) => sessionId !== currentSession.id),
          }))
        }
      },

      selectFile: (key: string) => {
        set((state) => {
          const selected = new Set(state.selectedFiles)
          if (selected.has(key)) {
            selected.delete(key)
          } else {
            selected.add(key)
          }
          return { selectedFiles: Array.from(selected) }
        })
      },

      selectFiles: (keys: string[]) => {
        set({ selectedFiles: keys })
      },

      clearSelection: () => {
        set({ selectedFiles: [] })
      },

      deleteSelectedFiles: async (skipRefresh = false) => {
        const { currentSession, selectedFiles } = get()
        if (!currentSession || selectedFiles.length === 0) return

        set({ isLoading: true, error: null })

        try {
          await invoke('delete_objects', {
            sessionId: currentSession.id,
            keys: selectedFiles,
          })

          // Remove deleted files from the list
          if (!skipRefresh) {
            get().removeFilesFromList(selectedFiles)
          }
          set({ selectedFiles: [], isLoading: false })
        } catch (error) {
          await logError(error, 'Failed to delete files')
          set({ error: `Failed to delete files: ${error}`, isLoading: false })
        }
      },

      uploadFile: async (key: string, filePath: string, contentType?: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('upload_object', {
            sessionId: currentSession.id,
            key,
            filePath,
            contentType: contentType || null,
          })

          // Reload files to show the new upload
          await get().loadFiles(get().currentPath)
        } catch (error) {
          await logError(error, 'Failed to upload file')
          throw error
        }
      },

      downloadFile: async (key: string, savePath: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await logger.info(`Starting download: ${key} to ${savePath}`)

          // Get file metadata to determine size
          let fileSize = 0
          try {
            const metadata = await invoke('get_object_metadata', {
              sessionId: currentSession.id,
              key
            })
            fileSize = (metadata as { size?: number })?.size || 0
          } catch (error) {
            await logger.warn('Failed to get file size, continuing with size 0', 'app-store', { error: error instanceof Error ? error.message : String(error) })
          }

          // Create persistent backend task
          const fileName = key.split('/').pop() || 'download'
          const backendTask = await invoke<BackendTask>('create_task', {
            sessionId: currentSession.id,
            taskType: 'download',
            localPath: savePath,
            remoteKey: key,
            contentType: null,
            totalSize: fileSize,
          })

          await logger.info(`Created backend download task: ${backendTask.id}`)

          // Add to frontend task list
          const downloadTask: UploadTask = {
            id: backendTask.id,
            name: fileName,
            key,
            type: 'download',
            size: fileSize,
            loaded: 0,
            progress: 0,
            speedBps: 0,
            status: 'pending',
            startedAt: Date.now(),
            updatedAt: Date.now(),
          }

          set(state => ({
            uploads: [...state.uploads, downloadTask]
          }))

          // Update backend task status to in_progress
          await invoke('update_task_status', {
            taskId: backendTask.id,
            status: 'in_progress',
            errorMessage: null,
          })

          // Update frontend status
          set(state => ({
            uploads: state.uploads.map(u => u.id === backendTask.id ? { ...u, status: 'uploading' } : u)
          }))

          // Listen for download progress events
          const unlistenProgress = await listen('download_progress', (e: { payload: { task_id: string; downloaded: number; total: number; speed_bps?: number } }) => {
            const p = e.payload
            if (!p || p.task_id !== backendTask.id) return

            const downloaded = Number(p.downloaded || 0)
            const total = Number(p.total || 0)
            const progress = total > 0 ? Math.floor((downloaded / total) * 100) : 0
            const speed = Number(p.speed_bps || 0)

            set(state => ({
              uploads: state.uploads.map(u => u.id === backendTask.id ? {
                ...u,
                loaded: downloaded,
                size: total || u.size,
                progress,
                speedBps: speed,
                updatedAt: Date.now(),
              } : u)
            }))

            // Update backend task progress
            invoke('update_task_progress', {
              taskId: backendTask.id,
              transferredSize: downloaded,
              totalSize: total > 0 ? total : null,
            }).catch((error) => {
              logger.warn('Failed to update backend task progress', 'app-store', { error: error instanceof Error ? error.message : String(error) })
            })
          })

          try {
            // Use resumable download with progress
            await invoke('download_object_with_progress', {
              sessionId: currentSession.id,
              key,
              savePath,
              taskId: backendTask.id,
              resumeFrom: null, // Start from beginning
            })

            // Mark as completed
            set(state => ({
              uploads: state.uploads.map(u => u.id === backendTask.id ? {
                ...u,
                progress: 100,
                loaded: u.size,
                speedBps: 0,
                status: 'completed'
              } : u)
            }))

            // Update backend task as completed
            await invoke('update_task_status', {
              taskId: backendTask.id,
              status: 'completed',
              errorMessage: null,
            })

            await logger.info(`Download completed: ${backendTask.id}`)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)

            // Update frontend as error
            set(state => ({
              uploads: state.uploads.map(u => u.id === backendTask.id ? {
                ...u,
                status: 'error',
                error: errorMsg
              } : u)
            }))

            // Update backend task as failed
            await invoke('update_task_status', {
              taskId: backendTask.id,
              status: 'failed',
              errorMessage: errorMsg,
            })

            await logError(error, 'Download failed')
            throw error
          } finally {
            // Clean up event listener
            if (unlistenProgress) {
              try {
                unlistenProgress()
              } catch (err) {
                await logError(err, 'Failed to unlisten download_progress')
              }
            }
          }
        } catch (error) {
          await logError(error, 'Failed to download file')
          throw error
        }
      },

      copyObject: async (sourceKey: string, destKey: string, skipRefresh = false) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('copy_object', {
            sessionId: currentSession.id,
            sourceKey,
            destKey,
          })

          // Reload files to show the copied object
          if (!skipRefresh) {
            await get().loadFiles(get().currentPath)
          }
        } catch (error) {
          await logError(error, 'Failed to copy object')
          throw error
        }
      },

      moveObject: async (sourceKey: string, destKey: string, skipRefresh?: boolean) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('move_object', {
            sessionId: currentSession.id,
            sourceKey,
            destKey,
          })

          // Reload files to show the moved object
          if (!skipRefresh) {
            await get().loadFiles(get().currentPath)
          }
        } catch (error) {
          await logError(error, 'Failed to move object')
          throw error
        }
      },

      copyPrefixContents: async (sourcePrefix: string, targetPrefix: string, skipRefresh = false) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        const normalizedSourcePrefix = ensureFolderPrefix(sourcePrefix)
        const normalizedTargetPrefix = ensureFolderPrefix(targetPrefix)

        if (!normalizedSourcePrefix || !normalizedTargetPrefix || normalizedSourcePrefix === normalizedTargetPrefix) {
          return []
        }

        if (normalizedTargetPrefix.startsWith(normalizedSourcePrefix)) {
          throw new Error('Cannot copy a folder into itself or one of its descendants')
        }

        const objects = await listAllObjectsWithPrefix(currentSession.id, normalizedSourcePrefix)
        const copiedKeys: string[] = []

        for (const object of objects) {
          const relativePath = object.key.substring(normalizedSourcePrefix.length)
          const destinationKey = `${normalizedTargetPrefix}${relativePath}`
          await get().copyObject(object.key, destinationKey, true)
          copiedKeys.push(destinationKey)
        }

        if (!skipRefresh) {
          await get().loadFiles(get().currentPath)
        }

        return copiedKeys
      },

      movePrefixContents: async (sourcePrefix: string, targetPrefix: string, skipRefresh = false) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        const normalizedSourcePrefix = ensureFolderPrefix(sourcePrefix)
        const normalizedTargetPrefix = ensureFolderPrefix(targetPrefix)

        if (!normalizedSourcePrefix || !normalizedTargetPrefix || normalizedSourcePrefix === normalizedTargetPrefix) {
          return []
        }

        if (normalizedTargetPrefix.startsWith(normalizedSourcePrefix)) {
          throw new Error('Cannot move a folder into itself or one of its descendants')
        }

        const objects = await listAllObjectsWithPrefix(currentSession.id, normalizedSourcePrefix)
        const movedEntries: Array<{ sourceKey: string; destKey: string }> = []

        for (const object of objects) {
          const relativePath = object.key.substring(normalizedSourcePrefix.length)
          const destinationKey = `${normalizedTargetPrefix}${relativePath}`
          await get().moveObject(object.key, destinationKey, true)
          movedEntries.push({ sourceKey: object.key, destKey: destinationKey })
        }

        if (!skipRefresh) {
          await get().loadFiles(get().currentPath)
        }

        return movedEntries
      },

      updateFileInList: (oldKey: string, newFile: Partial<FileItem> & { key: string }) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.key === oldKey
              ? { ...file, ...newFile }
              : file
          ),
        }))
      },

      removeFilesFromList: (keys: string[]) => {
        const keySet = new Set(keys)
        set((state) => ({
          files: state.files.filter((file) => !keySet.has(file.key)),
        }))
      },

      addFileToList: (file: FileItem) => {
        set((state) => {
          // Remove existing file with same key (handle duplicates)
          const existingFiles = state.files.filter(f => f.key !== file.key)

          // Add new file
          const updatedFiles = [...existingFiles, file]

          // Sort files according to current settings
          const { sortBy, sortOrder } = state
          updatedFiles.sort((a, b) => {
            // Folders first
            if (a.type !== b.type) {
              return a.type === 'folder' ? -1 : 1
            }

            let comparison = 0
            switch (sortBy) {
              case 'name':
                comparison = a.name.localeCompare(b.name)
                break
              case 'size':
                comparison = (a.size || 0) - (b.size || 0)
                break
              case 'modified':
                comparison = (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0)
                break
            }

            return sortOrder === 'asc' ? comparison : -comparison
          })

          return { files: updatedFiles }
        })
      },

      createFolder: async (prefix: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        const folderPrefix = ensureFolderPrefix(prefix)

        try {
          await invoke('create_folder', {
            sessionId: currentSession.id,
            prefix: folderPrefix,
          })

          // Add the new folder to the list
          const folderName = folderPrefix.slice(0, -1).split('/').pop() || ''
          const newFolder: FileItem = {
            key: folderPrefix,
            name: folderName,
            size: 0,
            lastModified: new Date(),
            type: 'folder',
          }
          get().addFileToList(newFolder)
          get().pushOperation({
            type: 'create_folder',
            description: `Create folder ${folderName}`,
            data: {
              createFolder: {
                folderKey: folderPrefix,
              },
            },
          })
        } catch (error) {
          await logError(error, 'Failed to create folder')
          throw error
        }
      },

      deleteFolder: async (prefix: string, skipRefresh = false) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        const folderPrefix = ensureFolderPrefix(prefix)

        try {
          await invoke('delete_folder', {
            sessionId: currentSession.id,
            prefix: folderPrefix,
          })

          // Remove folder from the list
          if (!skipRefresh) {
            get().removeFilesFromList([folderPrefix])
          }
        } catch (error) {
          await logError(error, 'Failed to delete folder')
          throw error
        }
      },

      // Upload queue operations
      enqueueUploads: async (files: File[], targetPath: string) => {
        const { currentSession, uploads } = get()
        if (!currentSession || files.length === 0) return

        await logger.debug('enqueueUploads called', 'app-store', {
          fileCount: files.length,
          targetPath,
          currentPath: get().currentPath,
          sessionId: currentSession.id
        })

        const now = Date.now()
        const base = targetPath || get().currentPath || ''

        // Create tasks and compute keys
        const newTasks: UploadTask[] = files.map((f, idx) => {
          const folder = base ? (base.endsWith('/') ? base : `${base}/`) : ''
          const key = `${folder}${f.name}`
          return {
            id: `${now}-${idx}-${f.name}`,
            name: f.name,
            key,
            type: 'upload',
            size: f.size,
            loaded: 0,
            progress: 0,
            speedBps: 0,
            status: 'pending',
            startedAt: now,
            updatedAt: now,
          }
        })

        await logger.debug('Creating upload tasks', 'app-store', {
          taskCount: newTasks.length,
          tasks: newTasks.map(t => ({ name: t.name, key: t.key, size: t.size }))
        })
        set({ uploads: [...uploads, ...newTasks] })

        // Start uploads with backend task creation for persistence
        await Promise.all(newTasks.map(async (task, i) => {
          const file = files[i]
          let activeTaskId = task.id
          let backendTaskId: string | null = null
          try {
            // Create persistent task in Rust backend
            const backendTask = await invoke<BackendTask>('create_task', {
              sessionId: currentSession.id,
              taskType: 'upload',
              localPath: `${BROWSER_UPLOAD_PATH_PREFIX}${file.webkitRelativePath || file.name}`,
              remoteKey: task.key,
              contentType: file.type || null,
              totalSize: file.size,
            })
            backendTaskId = backendTask.id
            activeTaskId = backendTask.id

            await logger.info(`Created backend task: ${backendTask.id} for upload: ${task.name}`)

            // Update frontend task with backend task ID for tracking
            set(state => ({
              uploads: state.uploads.map(u => u.id === task.id ? {
                ...u,
                id: backendTask.id, // Use backend task ID
                status: 'uploading',
                startedAt: Date.now(),
                updatedAt: Date.now()
              } : u)
            }))

            // Update backend task status to in_progress
            await invoke('update_task_status', {
              taskId: backendTask.id,
              status: 'in_progress',
              errorMessage: null,
            })

            // NOTE: Browser-based uploads using presigned URLs cannot support multipart uploads
            // because the browser doesn't have access to the file system for chunking.
            // This is a single-request upload, so no multipart_progress events are emitted.
            // For resumable multipart uploads, use enqueueUploadsFromPaths() with file paths.

            const { url } = await invoke<PresignedUrlResponse>('generate_presigned_url', {
              sessionId: currentSession.id,
              key: task.key,
              method: 'PUT',
              expiresIn: 900,
            })

            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest()
              let lastLoaded = 0
              let lastTs = Date.now()
              xhr.open('PUT', url)
              // Intentionally omit Content-Type to avoid signature mismatch

              xhr.upload.onprogress = async (e) => {
                const loaded = e.loaded
                const total = e.total || file.size
                const progress = total > 0 ? Math.floor((loaded / total) * 100) : 0
                const nowTs = Date.now()
                const dt = (nowTs - lastTs) / 1000
                const dbytes = loaded - lastLoaded
                const speed = dt > 0 ? dbytes / dt : 0
                lastLoaded = loaded
                lastTs = nowTs

                // Update frontend state
                set(state => ({
                  uploads: state.uploads.map(u => u.id === backendTask.id ? {
                    ...u,
                    loaded,
                    progress,
                    speedBps: speed,
                    updatedAt: nowTs,
                  } : u)
                }))

                // Update backend task progress
                try {
                  await invoke('update_task_progress', {
                    taskId: backendTask.id,
                    transferredSize: loaded,
                    totalSize: total,
                  })
                } catch (error) {
                  await logger.warn('Failed to update backend task progress', 'app-store', { error: error instanceof Error ? error.message : String(error) })
                }
              }

              xhr.onerror = async () => {
                const errorMsg = 'Network error'
                set(state => ({
                  uploads: state.uploads.map(u => u.id === backendTask.id ? {
                    ...u,
                    status: 'error',
                    error: errorMsg
                  } : u)
                }))

                // Update backend task as failed
                try {
                  await invoke('update_task_status', {
                    taskId: backendTask.id,
                    status: 'failed',
                    errorMessage: errorMsg,
                  })
                } catch (error) {
                  await logger.warn('Failed to update backend task status', 'app-store', { error: error instanceof Error ? error.message : String(error) })
                }

                reject(new Error('network error'))
              }

              xhr.onload = async () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  // Update frontend as completed
                  set(state => ({
                    uploads: state.uploads.map(u => u.id === backendTask.id ? {
                      ...u,
                      progress: 100,
                      loaded: file.size,
                      speedBps: 0,
                      status: 'completed'
                    } : u)
                  }))

                  // Update backend task as completed
                  try {
                    await invoke('update_task_status', {
                      taskId: backendTask.id,
                      status: 'completed',
                      errorMessage: null,
                    })
                    await logger.info(`Upload completed: ${backendTask.id}`)
                  } catch (error) {
                    await logger.warn('Failed to update backend task status', 'app-store', { error: error instanceof Error ? error.message : String(error) })
                  }

                  // Add the uploaded file to the list if it's in the currently viewed folder
                  const uploadedFolder = getFolderFromKey(task.key)
                  const currentFolder = normalizePath(get().currentPath)
                  if (get().currentSession?.id === currentSession.id && uploadedFolder === currentFolder) {
                    const newFile: FileItem = {
                      key: task.key,
                      name: task.name,
                      size: file.size,
                      lastModified: new Date(),
                      type: 'file',
                      contentType: file.type || undefined,
                    }
                    get().addFileToList(newFile)
                  }

                  resolve()
                } else {
                  const errorMsg = `HTTP ${xhr.status}`
                  set(state => ({
                    uploads: state.uploads.map(u => u.id === backendTask.id ? {
                      ...u,
                      status: 'error',
                      error: errorMsg
                    } : u)
                  }))

                  // Update backend task as failed
                  try {
                    await invoke('update_task_status', {
                      taskId: backendTask.id,
                      status: 'failed',
                      errorMessage: errorMsg,
                    })
                  } catch (error) {
                    await logger.warn('Failed to update backend task status', 'app-store', { error: error instanceof Error ? error.message : String(error) })
                  }

                  reject(new Error(`HTTP ${xhr.status}`))
                }
              }

              xhr.send(file)
            })
          } catch (err) {
            await logError(err, 'Upload failed')

            if (backendTaskId) {
              try {
                await invoke('update_task_status', {
                  taskId: backendTaskId,
                  status: 'failed',
                  errorMessage: err instanceof Error ? err.message : 'Upload failed',
                })
              } catch (error) {
                await logger.warn('Failed to update backend task status', 'app-store', { error: error instanceof Error ? error.message : String(error) })
              }
            }

            // Update frontend as error
            set(state => ({
              uploads: state.uploads.map(u => u.id === activeTaskId ? {
                ...u,
                status: 'error',
                error: err instanceof Error ? err.message : 'Upload failed'
              } : u)
            }))
          }
        }))
      },

      getActiveUploadCount: () => {
        const { uploads } = get()
        return uploads.filter(u => u.status === 'pending' || u.status === 'uploading').length
      },
      removeUpload: async (id: string) => {
        // Remove from frontend first
        set(state => ({ uploads: state.uploads.filter(u => u.id !== id) }))

        // Try to delete from backend (using task ID)
        try {
          await invoke('delete_task', { taskId: id })
          await logger.info(`Deleted backend task: ${id}`)
        } catch (error) {
          await logger.warn(`Failed to delete backend task ${id}`, 'app-store', { taskId: id, error: error instanceof Error ? error.message : String(error) })
          // Continue anyway since frontend task is already removed
        }
      },

      resumeUpload: async (taskId: string) => {
        try {
          await logger.info(`Attempting to resume task: ${taskId}`)

          // Get task details from backend
          const task = await invoke<BackendTask>('get_task', { taskId })
          await logger.debug('Retrieved task for resume', 'app-store', { task })

          // Extract task info
          const localPath = extractLocalPath(task)
          const remoteKey = extractKey(task)
          const taskSessionId = task.session_id

          if (!localPath || !remoteKey) {
            throw new Error('Unable to extract task details for resume')
          }

          // Check if it's a download task
          if ('Download' in task.task_type) {
            await logger.info(`Resuming download: ${taskId}`)

            // Update status to in_progress
            set(state => ({
              uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'uploading', error: undefined } : u)
            }))

            await invoke('update_task_status', {
              taskId,
              status: 'in_progress',
              errorMessage: null,
            })

            // Listen for download progress events
            const unlistenProgress = await listen('download_progress', (e: { payload: { task_id: string; downloaded: number; total: number; speed_bps?: number } }) => {
              const p = e.payload
              if (!p || p.task_id !== taskId) return

              const downloaded = Number(p.downloaded || 0)
              const total = Number(p.total || 0)
              const progress = total > 0 ? Math.floor((downloaded / total) * 100) : 0
              const speed = Number(p.speed_bps || 0)

              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  loaded: downloaded,
                  size: total || u.size,
                  progress,
                  speedBps: speed,
                  updatedAt: Date.now(),
                } : u)
              }))

              // Update backend task progress
              invoke('update_task_progress', {
                taskId,
                transferredSize: downloaded,
                totalSize: total > 0 ? total : null,
              }).catch((error) => {
                logger.warn('Failed to update backend task progress', 'app-store', { error: error instanceof Error ? error.message : String(error) })
              })
            })

            try {
              // Get current file size if exists for resume
              let resumeFrom: number | null = null
              try {
                const fs = await import('@tauri-apps/plugin-fs')
                const stat = await fs.stat(localPath)
                if (stat.size > 0) {
                  resumeFrom = Number(stat.size)
                  await logger.info(`Resuming download from byte: ${resumeFrom}`)
                }
              } catch {
                // File doesn't exist or can't stat, start from beginning
                resumeFrom = null
              }

              // Resume download with progress
              await invoke('download_object_with_progress', {
                sessionId: taskSessionId,
                key: remoteKey,
                savePath: localPath,
                taskId,
                resumeFrom,
              })

              // Mark as completed
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  progress: 100,
                  loaded: u.size,
                  speedBps: 0,
                  status: 'completed'
                } : u)
              }))

              // Update backend task as completed
              await invoke('update_task_status', {
                taskId,
                status: 'completed',
                errorMessage: null,
              })

              await logger.info(`Download completed: ${taskId}`)
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error)
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'error', error: errorMsg } : u)
              }))
              await invoke('update_task_status', {
                taskId,
                status: 'failed',
                errorMessage: errorMsg,
              })
              throw error
            } finally {
              if (unlistenProgress) {
                try {
                  unlistenProgress()
                } catch (err) {
                  await logError(err, 'Failed to unlisten download_progress during resume')
                }
              }
            }

            return
          }

          // Handle upload resume (existing code)
          // Check if task has multipart info
          if (task.metadata?.multipart_info) {
            const multipartInfo = task.metadata.multipart_info
            const uploadId = multipartInfo.upload_id
            const completedParts = multipartInfo.completed_parts || []

            await logger.info(`Resuming multipart upload: ${uploadId} with ${completedParts.length} completed parts`)

            // Update status to in_progress
            set(state => ({
              uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'uploading', error: undefined } : u)
            }))

            await invoke('update_task_status', {
              taskId,
              status: 'in_progress',
              errorMessage: null,
            })

            // Setup progress listeners
            const unlistenProgress = await listen('upload_progress', (e: { payload: UploadProgressEvent }) => {
              const p = e.payload
              if (!p || p.task_id !== taskId) return
              const uploaded = Number(p.uploaded || 0)
              const total = Number(p.total || 0)
              const progress = total > 0 ? Math.floor((uploaded / total) * 100) : (uploaded > 0 ? 100 : 0)
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  loaded: uploaded,
                  size: total || u.size,
                  progress,
                  updatedAt: Date.now(),
                } : u)
              }))
            })

            const resumedCompletedParts: Array<[number, string, number]> = completedParts.map((p) => [p.part_number, p.etag, p.size])
            const unlistenMultipart = await listen('multipart_progress', async (e: { payload: MultipartProgressEvent }) => {
              const p = e.payload
              if (!p || p.task_id !== taskId) return

              resumedCompletedParts.push([p.part_number, p.etag, p.part_size])

              try {
                await invoke('update_multipart_info', {
                  taskId,
                  uploadId: p.upload_id,
                  bucketName: p.bucket_name,
                  key: p.key,
                  partNumber: p.part_number,
                  completedParts: resumedCompletedParts,
                  uploadedSize: p.uploaded,
                  totalSize: p.total,
                })
              } catch (error) {
                await logger.warn('Failed to update multipart info during resume', 'app-store', { error: error instanceof Error ? error.message : String(error) })
              }
            })

            // Resume multipart upload
            try {
              await invoke('resume_multipart_upload', {
                sessionId: taskSessionId,
                key: remoteKey,
                localPath,
                uploadId,
                completedParts: resumedCompletedParts,
                taskId,
              })

              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  progress: 100,
                  loaded: u.size,
                  speedBps: 0,
                  status: 'completed',
                } : u),
              }))
              await invoke('update_task_status', {
                taskId,
                status: 'completed',
                errorMessage: null,
              })
              await logger.info(`Successfully resumed and completed upload: ${taskId}`)

              // Add the uploaded file to the list if it's in the currently viewed folder
              const currentState = get()
              const current = normalizePath(currentState.currentPath)
              const uploadedFolder = normalizePath(remoteKey.split('/').slice(0, -1).join('/'))
              if (currentState.currentSession?.id === taskSessionId && current === uploadedFolder) {
                // Get the updated task with final size from state
                const updatedTask = get().uploads.find(u => u.id === taskId)
                const fileName = remoteKey.split('/').pop() || 'file'
                const newFile: FileItem = {
                  key: remoteKey,
                  name: fileName,
                  size: updatedTask?.size || 0,
                  lastModified: new Date(),
                  type: 'file',
                }
                get().addFileToList(newFile)
              }
            } catch (err) {
              await logError(err, 'Resume multipart upload failed')
              set(state => ({ uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'error', error: String(err) } : u) }))
              await invoke('update_task_status', {
                taskId,
                status: 'failed',
                errorMessage: err instanceof Error ? err.message : String(err),
              })
            } finally {
              if (unlistenProgress) {
                try {
                  unlistenProgress()
                } catch (err) {
                  await logError(err, 'Failed to unlisten upload_progress during resume')
                }
              }
              if (unlistenMultipart) {
                try {
                  unlistenMultipart()
                } catch (err) {
                  await logError(err, 'Failed to unlisten multipart_progress during resume')
                }
              }
            }
          } else {
            if (localPath.startsWith(BROWSER_UPLOAD_PATH_PREFIX) || !isAbsoluteLocalPath(localPath)) {
              const errorMessage = 'This upload came from the in-app file picker and cannot be resumed automatically. Please select the file again.'
              await invoke('update_task_status', {
                taskId,
                status: 'failed',
                errorMessage,
              })
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  status: 'error',
                  error: errorMessage,
                } : u),
              }))
              return
            }

            await logger.info('No multipart info found, retrying upload from local path')

            const taskCompletedParts: Array<[number, string, number]> = []
            const unlistenProgress = await listen('upload_progress', (e: { payload: UploadProgressEvent }) => {
              const p = e.payload
              if (!p || p.task_id !== taskId) return
              const uploaded = Number(p.uploaded || 0)
              const total = Number(p.total || 0)
              const progress = total > 0 ? Math.floor((uploaded / total) * 100) : (uploaded > 0 ? 100 : 0)
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  loaded: uploaded,
                  size: total || u.size,
                  progress,
                  updatedAt: Date.now(),
                } : u),
              }))
            })
            const unlistenMultipart = await listen('multipart_progress', async (e: { payload: MultipartProgressEvent }) => {
              const p = e.payload
              if (!p || p.task_id !== taskId) return

              taskCompletedParts.push([p.part_number, p.etag, p.part_size])

              try {
                await invoke('update_multipart_info', {
                  taskId,
                  uploadId: p.upload_id,
                  bucketName: p.bucket_name,
                  key: p.key,
                  partNumber: p.part_number,
                  completedParts: taskCompletedParts,
                  uploadedSize: p.uploaded,
                  totalSize: p.total,
                })
              } catch (error) {
                await logger.warn('Failed to update multipart info during retry', 'app-store', { error: error instanceof Error ? error.message : String(error) })
              }
            })

            try {
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'uploading', error: undefined } : u),
              }))
              await invoke('update_task_status', {
                taskId,
                status: 'in_progress',
                errorMessage: null,
              })
              await invoke('upload_object_with_progress', {
                window: null,
                sessionId: taskSessionId,
                key: remoteKey,
                filePath: localPath,
                contentType: null,
                taskId,
              })

              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  progress: 100,
                  loaded: u.size,
                  speedBps: 0,
                  status: 'completed',
                } : u),
              }))
              await invoke('update_task_status', {
                taskId,
                status: 'completed',
                errorMessage: null,
              })

              const currentState = get()
              const currentFolder = normalizePath(currentState.currentPath)
              const uploadedFolder = getFolderFromKey(remoteKey)
              if (currentState.currentSession?.id === taskSessionId && currentFolder === uploadedFolder) {
                const updatedTask = currentState.uploads.find((upload) => upload.id === taskId)
                get().addFileToList({
                  key: remoteKey,
                  name: remoteKey.split('/').pop() || 'file',
                  size: updatedTask?.size || 0,
                  lastModified: new Date(),
                  type: 'file',
                })
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              set(state => ({
                uploads: state.uploads.map(u => u.id === taskId ? {
                  ...u,
                  status: 'error',
                  error: errorMessage,
                } : u),
              }))
              await invoke('update_task_status', {
                taskId,
                status: 'failed',
                errorMessage,
              })
            } finally {
              if (unlistenProgress) {
                try {
                  unlistenProgress()
                } catch (err) {
                  await logError(err, 'Failed to unlisten upload_progress during retry')
                }
              }
              if (unlistenMultipart) {
                try {
                  unlistenMultipart()
                } catch (err) {
                  await logError(err, 'Failed to unlisten multipart_progress during retry')
                }
              }
            }
          }
        } catch (error) {
          await logError(error, 'Failed to resume task')
          set(state => ({ uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'error', error: String(error) } : u) }))
        }
      },

      pauseUpload: async (taskId: string) => {
        try {
          await logger.info(`Pausing upload: ${taskId}`)

          // Update backend task status
          await invoke('pause_task', { taskId })

          // Update frontend status
          set(state => ({
            uploads: state.uploads.map(u => u.id === taskId ? { ...u, status: 'error', error: 'Paused by user' } : u)
          }))

          await logger.info(`Upload paused: ${taskId}`)
        } catch (error) {
          await logError(error, 'Failed to pause upload')
        }
      },

      cancelUpload: async (taskId: string) => {
        try {
          await logger.info(`Cancelling upload: ${taskId}`)

          // Get task to check if it has multipart info
          const task = await invoke<BackendTask>('get_task', { taskId })

          // If multipart upload, abort it
          if (task.metadata?.multipart_info) {
            const multipartInfo = task.metadata.multipart_info
            try {
              await invoke('abort_multipart_upload', {
                sessionId: task.session_id,
                key: multipartInfo.key,
                uploadId: multipartInfo.upload_id,
              })
              await logger.info(`Aborted multipart upload: ${multipartInfo.upload_id}`)
            } catch (error) {
              await logger.warn('Failed to abort multipart upload', 'app-store', { error: error instanceof Error ? error.message : String(error) })
            }
          }

          // Update backend task status to cancelled
          await invoke('cancel_task', { taskId })

          // Remove from frontend
          set(state => ({ uploads: state.uploads.filter(u => u.id !== taskId) }))

          await logger.info(`Upload cancelled: ${taskId}`)
        } catch (error) {
          await logError(error, 'Failed to cancel upload')
          // Still remove from frontend even if backend fails
          set(state => ({ uploads: state.uploads.filter(u => u.id !== taskId) }))
        }
      },

      enqueueUploadsFromPaths: async (paths: string[], targetPath: string) => {
        if (!paths || paths.length === 0) return
        const { currentSession } = get()
        if (!currentSession) return

        await logger.debug('enqueueUploadsFromPaths called', 'app-store', {
          pathCount: paths.length,
          fileNames: paths.map(p => p.split(/\\|\//).pop()),
          targetPath,
          currentPath: get().currentPath,
          sessionId: currentSession.id
        })

        const base = targetPath || get().currentPath || ''
        const folder = base ? (base.endsWith('/') ? base : `${base}/`) : ''

        // If R2 (or to avoid CORS), use backend upload with progress directly
        if (currentSession.config.type === 'r2') {
          await logger.debug('Using backend upload for R2', 'app-store')
          const now = Date.now()
          const newTasks: UploadTask[] = paths.map((fullPath, idx) => {
            const name = fullPath.split(/\\|\//).pop() || 'file'
            const key = `${folder}${name}`
            return {
              id: `${now}-${idx}-${name}`,
              name,
              key,
              type: 'upload',
              size: 0,
              loaded: 0,
              progress: 0,
              speedBps: 0,
              status: 'pending',
              startedAt: now,
              updatedAt: now,
            }
          })
          await logger.debug('Adding path-based tasks to queue', 'app-store', {
            taskCount: newTasks.length,
            tasks: newTasks.map(t => ({ name: t.name, key: t.key }))
          })
          set(state => ({ uploads: [...state.uploads, ...newTasks] }))

          await Promise.all(newTasks.map(async (task, i) => {
            const fullPath = paths[i]
            let activeTaskId = task.id
            let backendTaskId: string | null = null

            // Create task-specific completed parts array to avoid race condition
            const taskCompletedParts: Array<[number, string, number]> = []
            let unlistenProgress: (() => void) | undefined
            let unlistenMultipart: (() => void) | undefined

            try {
              const backendTask = await invoke<BackendTask>('create_task', {
                sessionId: currentSession.id,
                taskType: 'upload',
                localPath: fullPath,
                remoteKey: task.key,
                contentType: getContentTypeFromExtension(task.name),
                totalSize: 0,
              })
              backendTaskId = backendTask.id
              activeTaskId = backendTask.id

              set(state => ({
                uploads: state.uploads.map(u => u.id === task.id ? {
                  ...u,
                  id: backendTask.id,
                  status: 'uploading',
                  startedAt: Date.now(),
                  updatedAt: Date.now(),
                } : u),
              }))

              await invoke('update_task_status', {
                taskId: backendTask.id,
                status: 'in_progress',
                errorMessage: null,
              })

              // Listen to upload progress for this task
              unlistenProgress = await listen('upload_progress', (e: { payload: UploadProgressEvent }) => {
                const p = e.payload
                if (!p || p.task_id !== backendTask.id) return
                const uploaded = Number(p.uploaded || 0)
                const total = Number(p.total || 0)
                const progress = total > 0 ? Math.floor((uploaded / total) * 100) : (uploaded > 0 ? 100 : 0)
                set(state => ({
                  uploads: state.uploads.map(u => u.id === backendTask.id ? {
                    ...u,
                    loaded: uploaded,
                    size: total || u.size,
                    progress,
                    updatedAt: Date.now(),
                  } : u),
                }))
              })

              // Listen to multipart progress for persistence
              unlistenMultipart = await listen('multipart_progress', async (e: { payload: MultipartProgressEvent }) => {
                const p = e.payload
                if (!p || p.task_id !== backendTask.id) return

                // Track completed part in task-specific array
                taskCompletedParts.push([p.part_number, p.etag, p.part_size])

                // Persist multipart info to backend
                try {
                  await invoke('update_multipart_info', {
                    taskId: backendTask.id,
                    uploadId: p.upload_id,
                    bucketName: p.bucket_name,
                    key: p.key,
                    partNumber: p.part_number,
                    completedParts: taskCompletedParts,
                    uploadedSize: p.uploaded,
                    totalSize: p.total,
                  })
                } catch (error) {
                  await logger.warn('Failed to update multipart info', 'app-store', { error: error instanceof Error ? error.message : String(error) })
                }
              })

              await invoke('upload_object_with_progress', {
                window: null,
                sessionId: currentSession.id,
                key: task.key,
                filePath: fullPath,
                contentType: getContentTypeFromExtension(task.name),
                taskId: backendTask.id,
              })
              set(state => ({
                uploads: state.uploads.map(u => u.id === backendTask.id ? {
                  ...u,
                  progress: 100,
                  loaded: u.size,
                  speedBps: 0,
                  status: 'completed',
                } : u),
              }))
              await invoke('update_task_status', {
                taskId: backendTask.id,
                status: 'completed',
                errorMessage: null,
              })

              // Add the uploaded file to the list if it's in the currently viewed folder
              const uploadedFolder = getFolderFromKey(task.key)
              const currentFolder = normalizePath(get().currentPath)
              if (get().currentSession?.id === currentSession.id && uploadedFolder === currentFolder) {
                // Get the updated task with final size from state
                const updatedTask = get().uploads.find(u => u.id === backendTask.id)
                const newFile: FileItem = {
                  key: task.key,
                  name: task.name,
                  size: updatedTask?.size || 0,
                  lastModified: new Date(),
                  type: 'file',
                }
                get().addFileToList(newFile)
              }
            } catch (err) {
              await logError(err, 'Backend upload failed')
              if (backendTaskId) {
                try {
                  await invoke('update_task_status', {
                    taskId: backendTaskId,
                    status: 'failed',
                    errorMessage: err instanceof Error ? err.message : String(err),
                  })
                } catch (error) {
                  await logger.warn('Failed to update backend task status', 'app-store', { error: error instanceof Error ? error.message : String(error) })
                }
              }
              set(state => ({ uploads: state.uploads.map(u => u.id === activeTaskId ? { ...u, status: 'error', error: String(err) } : u) }))
            } finally {
              if (unlistenProgress) {
                try {
                  unlistenProgress()
                } catch (err) {
                  await logError(err, 'Failed to unlisten upload_progress')
                }
              }
              if (unlistenMultipart) {
                try {
                  unlistenMultipart()
                } catch (err) {
                  await logError(err, 'Failed to unlisten multipart_progress')
                }
              }
            }
          }))
          return
        }

        // Non-R2 path: still allow front-end progress (CORS must be configured on server)
        const fs = await getFsModule()
        if (!fs) {
          // fallback to backend without progress
          for (const fullPath of paths) {
            const name = fullPath.split(/\\|\//).pop() || 'file'
            const key = `${folder}${name}`
            try { await get().uploadFile(key, fullPath) } catch (e) { await logError(e, 'Fallback upload failed') }
          }
          return
        }
        const files: File[] = []
        for (const fullPath of paths) {
          try {
            const data = await fs.readFile(fullPath)
            const name = fullPath.split(/\\|\//).pop() || 'file'
            const file = new File([new Uint8Array(data)], name, { type: 'application/octet-stream' })
            files.push(file)
          } catch (e) { await logError(e, `readFile failed for ${fullPath}`) }
        }
        if (files.length > 0) {
          await get().enqueueUploads(files, targetPath)
        }
      },

      // Clipboard operations
      copyFiles: (files: FileItem[]) => {
        const { currentSession } = get()
        set({
          clipboard: {
            files: [...files],
            operation: 'copy',
            sourceSessionId: currentSession?.id || null,
            sourceConfig: currentSession?.config || null,
          },
        })
        logger.info(`Copied ${files.length} files to clipboard`)
      },

      cutFiles: (files: FileItem[]) => {
        const { currentSession } = get()
        set({
          clipboard: {
            files: [...files],
            operation: 'cut',
            sourceSessionId: currentSession?.id || null,
            sourceConfig: currentSession?.config || null,
          },
        })
        logger.info(`Cut ${files.length} files to clipboard`)
      },

      pasteFiles: async (targetPath: string) => {
        const { clipboard, currentSession, currentPath } = get()
        if (!clipboard.files.length || !clipboard.operation || !currentSession) {
          await logger.warn('Cannot paste: no files in clipboard or no active session')
          return
        }

        set({ isLoading: true, error: null })

        try {
          const normalizedTarget = normalizePath(targetPath || currentPath || '')
          const targetFolder = ensureFolderPrefix(normalizedTarget)
          const movedEntries: Array<{ sourceKey: string; destKey: string }> = []
          const copiedKeys: string[] = []
          const copyEntries: Array<{ sourceKey: string; destKey: string }> = []

          // Check if this is a cross-session operation
          const isCrossSession = clipboard.sourceSessionId !== null &&
                                 clipboard.sourceSessionId !== currentSession.id

          await logger.info(`Pasting ${clipboard.files.length} files to ${targetFolder}`, 'app-store', {
            operation: clipboard.operation,
            fileCount: clipboard.files.length,
            isCrossSession,
            sourceSessionId: clipboard.sourceSessionId,
            targetSessionId: currentSession.id,
          })

          // Helper function for cross-session file transfer
          const crossSessionTransfer = async (
            sourceKey: string,
            targetKey: string,
            sourceSessionId: string,
            deleteSource: boolean
          ) => {
            await logger.info(`Cross-session transfer: ${sourceKey} -> ${targetKey}`, 'app-store', {
              sourceSession: sourceSessionId,
              targetSession: currentSession.id,
              deleteSource,
            })
            await invoke('transfer_object_between_sessions', {
              sourceSessionId,
              sourceKey,
              targetSessionId: currentSession.id,
              targetKey,
              deleteSource,
            })
          }

          for (const file of clipboard.files) {
            // Extract filename from the key
            const fileName = file.name
            const newKey = joinObjectKey(normalizedTarget, fileName)

            // Skip if source and destination are the same (only for same session)
            if (!isCrossSession && normalizePath(file.key) === normalizePath(newKey)) {
              await logger.warn(`Skipping paste: source and destination are the same`, 'app-store', { key: file.key })
              continue
            }

            if (isCrossSession && clipboard.sourceSessionId) {
              // Cross-session operation
              if (file.type === 'file') {
                await crossSessionTransfer(
                  file.key,
                  newKey,
                  clipboard.sourceSessionId,
                  clipboard.operation === 'cut'
                )
              } else {
                // Recursively transfer folder contents
                const sourceFolderKey = ensureFolderPrefix(file.key)
                const targetFolderKey = ensureFolderPrefix(newKey)
                const objects = await listAllObjectsWithPrefix(clipboard.sourceSessionId, sourceFolderKey)

                for (const object of objects) {
                  const relativePath = object.key.substring(sourceFolderKey.length)
                  const destinationKey = `${targetFolderKey}${relativePath}`
                  await crossSessionTransfer(
                    object.key,
                    destinationKey,
                    clipboard.sourceSessionId,
                    clipboard.operation === 'cut'
                  )
                  await logger.debug(`Cross-session transferred ${object.key} to ${destinationKey}`)
                }

                await logger.info(`Recursively transferred folder ${sourceFolderKey} to ${targetFolderKey}`)
              }
            } else {
              // Same session operation
              if (clipboard.operation === 'copy') {
                if (file.type === 'file') {
                  await get().copyObject(file.key, newKey, true)
                  copiedKeys.push(newKey)
                  copyEntries.push({ sourceKey: file.key, destKey: newKey })
                } else {
                  const sourcePrefix = ensureFolderPrefix(file.key)
                  const targetPrefix = ensureFolderPrefix(newKey)
                  const prefixCopiedKeys = await get().copyPrefixContents(
                    sourcePrefix,
                    targetPrefix,
                    true
                  )
                  copiedKeys.push(...prefixCopiedKeys)
                  copyEntries.push(
                    ...prefixCopiedKeys.map((destKey) => ({
                      sourceKey: `${sourcePrefix}${destKey.substring(targetPrefix.length)}`,
                      destKey,
                    }))
                  )
                }
              } else if (clipboard.operation === 'cut') {
                if (file.type === 'file') {
                  await get().moveObject(file.key, newKey, true)
                  movedEntries.push({ sourceKey: file.key, destKey: newKey })
                } else {
                  movedEntries.push(...await get().movePrefixContents(
                    ensureFolderPrefix(file.key),
                    ensureFolderPrefix(newKey),
                    true
                  ))
                }
              }
            }
          }

          if (clipboard.operation === 'cut' && movedEntries.length > 0) {
            get().pushOperation({
              type: 'move',
              description: `Move ${movedEntries.length} object(s)`,
              data: {
                move: movedEntries,
              },
            })
          }

          if (clipboard.operation === 'copy' && copiedKeys.length > 0) {
            get().pushOperation({
              type: 'copy',
              description: `Copy ${copiedKeys.length} object(s)`,
              data: {
                copy: { copiedKeys, entries: copyEntries },
              },
            })
          }

          // Clear clipboard after cut operation
          if (clipboard.operation === 'cut') {
            set({
              clipboard: {
                files: [],
                operation: null,
                sourceSessionId: null,
                sourceConfig: null,
              },
            })
          }

          // Reload files to show the changes
          await get().loadFiles(currentPath)
          set({ isLoading: false })

          await logger.info(`Successfully pasted ${clipboard.files.length} files`)
        } catch (error) {
          await logError(error, 'Failed to paste files')
          set({ error: `Failed to paste files: ${error}`, isLoading: false })
          throw error
        }
      },

      clearClipboard: () => {
        set({
          clipboard: {
            files: [],
            operation: null,
            sourceSessionId: null,
            sourceConfig: null,
          },
        })
      },

      hasClipboardContent: () => {
        const { clipboard } = get()
        return clipboard.files.length > 0 && clipboard.operation !== null
      },

      // UI state management
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      setError: (error: string | null) => set({ error }),
      setSearchQuery: (query: string) => set({ searchQuery: query }),
      setViewMode: (mode: 'list' | 'grid') => set({ viewMode: mode }),
      setSortBy: (sortBy: 'name' | 'size' | 'modified') => set({ sortBy }),
      setSortOrder: (order: 'asc' | 'desc') => set({ sortOrder: order }),
      toggleSplitView: () => set((state) => ({ isSplitView: !state.isSplitView })),

      // Utility functions
      generateSessionId: async () => {
        return await invoke<string>('generate_session_id')
      },

      getAppInfo: async () => {
        return await invoke('get_app_info')
      },

      // Operation history (undo/redo)
      pushOperation: (operation) => {
        const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const newOperation: UndoableOperation = {
          ...operation,
          id,
          timestamp: Date.now(),
        }

        set((state) => ({
          operationHistory: {
            past: [...state.operationHistory.past.slice(-49), newOperation], // Keep last 50 operations
            future: [], // Clear future when new operation is pushed
          },
        }))
      },

      canUndo: () => {
        return get().operationHistory.past.length > 0
      },

      canRedo: () => {
        return get().operationHistory.future.length > 0
      },

      clearOperationHistory: () => {
        set({
          operationHistory: {
            past: [],
            future: [],
          },
        })
      },

      undo: async () => {
        const { operationHistory, currentSession } = get()
        if (operationHistory.past.length === 0 || !currentSession) return

        const operation = operationHistory.past[operationHistory.past.length - 1]
        const newPast = operationHistory.past.slice(0, -1)

        try {
          switch (operation.type) {
            case 'rename':
              if (operation.data.rename) {
                // Undo rename by renaming back
                const { oldKey, newKey } = operation.data.rename
                await invoke('move_object', {
                  sessionId: currentSession.id,
                  sourceKey: newKey,
                  destKey: oldKey,
                })
                await get().loadFiles(get().currentPath)
              }
              break

            case 'move':
              if (operation.data.move) {
                // Undo move by moving back
                for (const { sourceKey, destKey } of operation.data.move) {
                  await invoke('move_object', {
                    sessionId: currentSession.id,
                    sourceKey: destKey,
                    destKey: sourceKey,
                  })
                }
                await get().loadFiles(get().currentPath)
              }
              break

            case 'copy':
              if (operation.data.copy) {
                // Undo copy by deleting copied files
                for (const key of operation.data.copy.copiedKeys) {
                  await invoke('delete_object', {
                    sessionId: currentSession.id,
                    key,
                  })
                }
                await get().loadFiles(get().currentPath)
              }
              break

            case 'create_folder':
              if (operation.data.createFolder) {
                // Undo create folder by deleting it
                await invoke('delete_folder', {
                  sessionId: currentSession.id,
                  prefix: operation.data.createFolder.folderKey,
                })
                await get().loadFiles(get().currentPath)
              }
              break

            case 'delete':
              // Delete cannot be undone in object storage
              await logger.warn('Delete operation cannot be undone', 'undo', { operation: operation.id })
              return // Don't move to future
          }

          // Move operation to future for redo
          set({
            operationHistory: {
              past: newPast,
              future: [operation, ...operationHistory.future],
            },
          })
        } catch (error) {
          await logError(error, 'Failed to undo operation', 'undo')
          throw error
        }
      },

      redo: async () => {
        const { operationHistory, currentSession } = get()
        if (operationHistory.future.length === 0 || !currentSession) return

        const operation = operationHistory.future[0]
        const newFuture = operationHistory.future.slice(1)

        try {
          switch (operation.type) {
            case 'rename':
              if (operation.data.rename) {
                // Redo rename
                const { oldKey, newKey } = operation.data.rename
                await invoke('move_object', {
                  sessionId: currentSession.id,
                  sourceKey: oldKey,
                  destKey: newKey,
                })
                await get().loadFiles(get().currentPath)
              }
              break

            case 'move':
              if (operation.data.move) {
                // Redo move
                for (const { sourceKey, destKey } of operation.data.move) {
                  await invoke('move_object', {
                    sessionId: currentSession.id,
                    sourceKey: sourceKey,
                    destKey: destKey,
                  })
                }
                await get().loadFiles(get().currentPath)
              }
              break

            case 'copy':
              if (operation.data.copy?.entries) {
                for (const { sourceKey, destKey } of operation.data.copy.entries) {
                  await invoke('copy_object', {
                    sessionId: currentSession.id,
                    sourceKey,
                    destKey,
                  })
                }
                await get().loadFiles(get().currentPath)
              }
              break

            case 'create_folder':
              if (operation.data.createFolder) {
                // Redo create folder
                await invoke('create_folder', {
                  sessionId: currentSession.id,
                  prefix: operation.data.createFolder.folderKey,
                })
                await get().loadFiles(get().currentPath)
              }
              break

            case 'delete':
              // Delete cannot be redone
              return
          }

          // Move operation back to past
          set({
            operationHistory: {
              past: [...operationHistory.past, operation],
              future: newFuture,
            },
          })
        } catch (error) {
          await logError(error, 'Failed to redo operation', 'redo')
          throw error
        }
      },
    }),
    {
      name: 'r2browser-storage',
      partialize: (state) => ({
        // Only persist UI preferences, not sensitive session data
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        // Don't persist sessions - they're now securely stored in Rust backend
      }),
    }
  )
)
