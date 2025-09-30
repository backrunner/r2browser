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
  AppInfo
} from '../types'
import { listen } from '@tauri-apps/api/event'
import { logger, logError } from '../lib/logger'

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

interface AppState {
  // Session management
  sessions: SessionData[]
  currentSession: SessionData | null
  sessionStats: SessionStats | null

  // Navigation state
  currentPath: string
  navigationHistory: string[]

  // File management state
  files: FileItem[]
  selectedFiles: string[]

  // UI state
  isLoading: boolean
  error: string | null
  searchQuery: string
  viewMode: 'list' | 'grid'
  sortBy: 'name' | 'size' | 'modified'
  sortOrder: 'asc' | 'desc'

  // Application state
  isInitialized: boolean
  appInfo: AppInfo | null

  // Upload queue
  uploads: UploadTask[]
}

interface AppActions {
  // Application initialization
  initializeApp: () => Promise<void>

  // Session management
  createSession: (config: StorageConfig) => Promise<string>
  loadSessions: () => Promise<void>
  loadSessionStats: () => Promise<void>
  setCurrentSession: (session: SessionData | null) => void
  updateSessionMetadata: (sessionId: string, updates: {
    name?: string
    is_favorite?: boolean
    tags?: string[]
  }) => Promise<void>
  removeSession: (sessionId: string) => Promise<void>
  testConnection: (config: StorageConfig) => Promise<boolean>

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
  deleteSelectedFiles: () => Promise<void>
  uploadFile: (key: string, filePath: string, contentType?: string) => Promise<void>
  downloadFile: (key: string, savePath: string) => Promise<void>
  copyObject: (sourceKey: string, destKey: string) => Promise<void>
  moveObject: (sourceKey: string, destKey: string) => Promise<void>
  createFolder: (prefix: string) => Promise<void>
  deleteFolder: (prefix: string) => Promise<void>

  // Upload queue operations
  enqueueUploads: (files: File[], targetPath: string) => Promise<void>
  getActiveUploadCount: () => number
  enqueueUploadsFromPaths: (paths: string[], targetPath: string) => Promise<void>
  removeUpload: (id: string) => Promise<void>

  // UI state management
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'grid') => void
  setSortBy: (sortBy: 'name' | 'size' | 'modified') => void
  setSortOrder: (order: 'asc' | 'desc') => void

  // Utility functions
  generateSessionId: () => Promise<string>
  getAppInfo: () => Promise<AppInfo>
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      currentSession: null,
      sessionStats: null,
      currentPath: '',
      navigationHistory: [],
      files: [],
      selectedFiles: [],
      isLoading: false,
      error: null,
      searchQuery: '',
      viewMode: 'list',
      sortBy: 'name',
      sortOrder: 'asc',
      isInitialized: false,
      appInfo: null,
      uploads: [],

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
          await await logError(error, 'Failed to initialize app', 'app-store')
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
          await await logError(error, 'Failed to create session', 'app-store')
          set({
            error: `Failed to create session: ${error}`,
            isLoading: false
          })
          throw error
        }
      },

      loadSessions: async () => {
        try {
          const sessionsMap = await invoke<Record<string, StorageConfig>>('get_sessions')

          // Convert the sessions map to SessionData array
          const sessions: SessionData[] = []
          for (const [sessionId] of Object.entries(sessionsMap)) {
            try {
              const sessionData = await invoke<SessionData>('get_session_data', { sessionId })
              sessions.push(sessionData)
            } catch (error) {
              await logger.warn(`Failed to load session data for ${sessionId}`, 'app-store', { sessionId, error: error instanceof Error ? error.message : String(error) })
            }
          }

          set({ sessions })
        } catch (error) {
          await await logError(error, 'Failed to load sessions', 'app-store')
          set({ error: `Failed to load sessions: ${error}` })
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

      // Navigation
      setCurrentPath: (path: string) => {
        const { navigationHistory } = get()
        const newHistory = [...navigationHistory, path]
        set({
          currentPath: path,
          selectedFiles: [],
          navigationHistory: newHistory.slice(-50) // Keep last 50 entries
        })
      },

      navigateToPath: async (path: string) => {
        get().setCurrentPath(path)
        await get().loadFiles(path)
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

        set({ isLoading: true, error: null })

        try {
          const response = await invoke<ListObjectsResponse>('list_objects', {
            sessionId: currentSession.id,
            prefix: prefix || null,
            maxKeys: 1000,
            continuationToken: null,
          })

          // Process objects into file items
          const fileMap = new Map<string, FileItem>()
          const prefixLength = prefix ? prefix.length + (prefix.endsWith('/') ? 0 : 1) : 0

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
              const folderKey = prefix ? `${prefix}/${folderName}/` : `${folderName}/`

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

          set({ files, isLoading: false })

          // Auto-load unfinished tasks: Check for unfinished tasks after successful bucket connection
          await get().autoRecoverTasks()
        } catch (error) {
          await logError(error, 'Failed to load files')
          set({ error: `Failed to load files: ${error}`, isLoading: false })
        }
      },

      autoRecoverTasks: async () => {
        const { currentSession } = get()
        if (!currentSession) return

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
                uploads: [...state.uploads, ...recoveredTasks]
              }))
              await logger.info(`Added ${recoveredTasks.length} recovered tasks to upload queue`)
            }
          }

          await logger.info('Automatic task recovery completed successfully')
        } catch (error) {
          await logError(error, 'Automatic task recovery failed')
          // Don't show error to user since this is background operation
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

      deleteSelectedFiles: async () => {
        const { currentSession, selectedFiles, currentPath } = get()
        if (!currentSession || selectedFiles.length === 0) return

        set({ isLoading: true, error: null })

        try {
          await invoke('delete_objects', {
            sessionId: currentSession.id,
            keys: selectedFiles,
          })

          // Reload files and clear selection
          await get().loadFiles(currentPath)
          set({ selectedFiles: [] })
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
          await invoke('download_object', {
            sessionId: currentSession.id,
            key,
            savePath,
          })
        } catch (error) {
          await logError(error, 'Failed to download file')
          throw error
        }
      },

      copyObject: async (sourceKey: string, destKey: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('copy_object', {
            sessionId: currentSession.id,
            sourceKey,
            destKey,
          })

          // Reload files to show the copied object
          await get().loadFiles(get().currentPath)
        } catch (error) {
          await logError(error, 'Failed to copy object')
          throw error
        }
      },

      moveObject: async (sourceKey: string, destKey: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('move_object', {
            sessionId: currentSession.id,
            sourceKey,
            destKey,
          })

          // Reload files to show the moved object
          await get().loadFiles(get().currentPath)
        } catch (error) {
          await logError(error, 'Failed to move object')
          throw error
        }
      },

      createFolder: async (prefix: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('create_folder', {
            sessionId: currentSession.id,
            prefix,
          })

          // Reload files to show the new folder
          await get().loadFiles(get().currentPath)
        } catch (error) {
          await logError(error, 'Failed to create folder')
          throw error
        }
      },

      deleteFolder: async (prefix: string) => {
        const { currentSession } = get()
        if (!currentSession) throw new Error('No active session')

        try {
          await invoke('delete_folder', {
            sessionId: currentSession.id,
            prefix,
          })

          // Reload files to reflect the deletion
          await get().loadFiles(get().currentPath)
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
          try {
            // Create persistent task in Rust backend
            const backendTask = await invoke<BackendTask>('create_task', {
              sessionId: currentSession.id,
              taskType: 'upload',
              localPath: file.webkitRelativePath || file.name, // Use file path for backend
              remoteKey: task.key,
              contentType: file.type || null,
              totalSize: file.size,
            })

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

            // Reload listing if uploaded into current folder
            const current = get().currentPath
            const uploadedFolder = task.key.split('/').slice(0, -1).join('/')
            if ((current || '') === (uploadedFolder || '')) {
              await get().loadFiles(current)
            }
          } catch (err) {
            await logError(err, 'Upload failed')

            // Update frontend as error
            set(state => ({
              uploads: state.uploads.map(u => u.id === task.id ? {
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
            // listen to progress for this task
            const unlisten = await listen('upload_progress', (e: { payload: UploadProgressEvent }) => {
              const p = e.payload
              if (!p || p.task_id !== task.id) return
              const uploaded = Number(p.uploaded || 0)
              const total = Number(p.total || 0)
              const progress = total > 0 ? Math.floor((uploaded / total) * 100) : (uploaded > 0 ? 100 : 0)
              set(state => ({
                uploads: state.uploads.map(u => u.id === task.id ? {
                  ...u,
                  loaded: uploaded,
                  size: total || u.size,
                  progress,
                  updatedAt: Date.now(),
                } : u)
              }))
            })
            try {
              set(state => ({ uploads: state.uploads.map(u => u.id === task.id ? { ...u, status: 'uploading' } : u) }))
              await invoke('upload_object_with_progress', {
                window: null,
                sessionId: currentSession.id,
                key: task.key,
                filePath: fullPath,
                contentType: null,
                taskId: task.id,
              })
              set(state => ({ uploads: state.uploads.map(u => u.id === task.id ? { ...u, progress: 100, status: 'completed' } : u) }))
              // refresh listing if in current folder
              const current = get().currentPath
              const uploadedFolder = task.key.split('/').slice(0, -1).join('/')
              if ((current || '') === (uploadedFolder || '')) {
                await get().loadFiles(current)
              }
            } catch (err) {
              await logError(err, 'Backend upload failed')
              set(state => ({ uploads: state.uploads.map(u => u.id === task.id ? { ...u, status: 'error', error: String(err) } : u) }))
            } finally {
              try { (unlisten as () => void)() } catch (err) {
                await logError(err, 'Failed to unlisten to upload progress')
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

      // UI state management
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      setError: (error: string | null) => set({ error }),
      setSearchQuery: (query: string) => set({ searchQuery: query }),
      setViewMode: (mode: 'list' | 'grid') => set({ viewMode: mode }),
      setSortBy: (sortBy: 'name' | 'size' | 'modified') => set({ sortBy }),
      setSortOrder: (order: 'asc' | 'desc') => set({ sortOrder: order }),

      // Utility functions
      generateSessionId: async () => {
        return await invoke<string>('generate_session_id')
      },

      getAppInfo: async () => {
        return await invoke('get_app_info')
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
