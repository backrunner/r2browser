import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { StorageConfig, SessionData, SessionStats } from '../types'

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
  appInfo: any | null
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

  // UI state management
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'grid') => void
  setSortBy: (sortBy: 'name' | 'size' | 'modified') => void
  setSortOrder: (order: 'asc' | 'desc') => void

  // Utility functions
  generateSessionId: () => Promise<string>
  getAppInfo: () => Promise<any>
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

      // Application initialization
      initializeApp: async () => {
        try {
          set({ isLoading: true, error: null })

          // Initialize the Rust backend
          await invoke('initialize_app')

          // Load application info
          const appInfo = await invoke('get_app_info')

          // Load existing sessions
          await get().loadSessions()
          await get().loadSessionStats()

          set({
            isInitialized: true,
            appInfo,
            isLoading: false
          })
        } catch (error) {
          console.error('Failed to initialize app:', error)
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
          console.error('Failed to create session:', error)
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
              console.warn(`Failed to load session data for ${sessionId}:`, error)
            }
          }

          set({ sessions })
        } catch (error) {
          console.error('Failed to load sessions:', error)
          set({ error: `Failed to load sessions: ${error}` })
        }
      },

      loadSessionStats: async () => {
        try {
          const sessionStats = await invoke<SessionStats>('get_session_stats')
          set({ sessionStats })
        } catch (error) {
          console.error('Failed to load session stats:', error)
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
          console.error('Failed to update session metadata:', error)
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
          console.error('Failed to remove session:', error)
          set({ error: `Failed to remove session: ${error}` })
          throw error
        }
      },

      testConnection: async (config: StorageConfig) => {
        try {
          await invoke('test_connection', { config })
          return true
        } catch (error) {
          console.error('Connection test failed:', error)
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
        } catch (error) {
          console.error('Failed to load files:', error)
          set({ error: `Failed to load files: ${error}`, isLoading: false })
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
          console.error('Failed to delete files:', error)
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
          console.error('Failed to upload file:', error)
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
          console.error('Failed to download file:', error)
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
          console.error('Failed to copy object:', error)
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
          console.error('Failed to move object:', error)
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
          console.error('Failed to create folder:', error)
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
          console.error('Failed to delete folder:', error)
          throw error
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
