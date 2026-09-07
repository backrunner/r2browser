import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { logError } from '@/lib/logger'
import { sharedPreferencesStorage } from '@/lib/shared-preferences-storage'

interface PreferencesState {
  updateChannel: 'stable' | 'beta'

  // Download settings
  downloadFolder: string | null
  askDownloadLocation: boolean

  // View settings
  defaultViewMode: 'list' | 'grid'

  // Confirmation dialogs
  confirmDelete: boolean
  confirmOverwrite: boolean

  // Startup behavior
  startupBehavior: 'welcome' | 'last-session'
  lastSessionId: string | null

  // Transfer settings
  maxConcurrentUploads: number
  maxConcurrentDownloads: number
}

interface PreferencesActions {
  setUpdateChannel: (channel: 'stable' | 'beta') => void
  setDownloadFolder: (folder: string | null) => void
  setAskDownloadLocation: (ask: boolean) => void
  getDefaultDownloadFolder: () => Promise<string>
  setDefaultViewMode: (mode: 'list' | 'grid') => void
  setConfirmDelete: (confirm: boolean) => void
  setConfirmOverwrite: (confirm: boolean) => void
  setStartupBehavior: (behavior: 'welcome' | 'last-session') => void
  setLastSessionId: (sessionId: string | null) => void
  setMaxConcurrentUploads: (max: number) => void
  setMaxConcurrentDownloads: (max: number) => void
  resetToDefaults: () => void
}

const defaultPreferences: PreferencesState = {
  updateChannel: typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__.includes('-beta.') ? 'beta' : 'stable',
  downloadFolder: null,
  askDownloadLocation: false,
  defaultViewMode: 'list',
  confirmDelete: true,
  confirmOverwrite: true,
  startupBehavior: 'welcome',
  lastSessionId: null,
  maxConcurrentUploads: 3,
  maxConcurrentDownloads: 3,
}

export const usePreferencesStore = create<PreferencesState & PreferencesActions>()(
  persist(
    (set, get) => ({
      // Initial state
      ...defaultPreferences,

      // Actions
      setUpdateChannel: (updateChannel: 'stable' | 'beta') => {
        set({ updateChannel })
      },

      setDownloadFolder: (folder: string | null) => {
        set({ downloadFolder: folder })
      },

      setAskDownloadLocation: (ask: boolean) => {
        set({ askDownloadLocation: ask })
      },

      getDefaultDownloadFolder: async () => {
        const { downloadFolder } = get()

        // If user has set a custom download folder, use it
        if (downloadFolder) {
          return downloadFolder
        }

        // Otherwise, get system default download folder
        try {
          const defaultFolder = await invoke<string>('get_download_folder')
          return defaultFolder
        } catch (error) {
          // Fallback to Downloads folder if command not available
          logError(error, 'Failed to get download folder', 'preferences')
          return ''
        }
      },

      setDefaultViewMode: (mode: 'list' | 'grid') => {
        set({ defaultViewMode: mode })
      },

      setConfirmDelete: (confirm: boolean) => {
        set({ confirmDelete: confirm })
      },

      setConfirmOverwrite: (confirm: boolean) => {
        set({ confirmOverwrite: confirm })
      },

      setStartupBehavior: (behavior: 'welcome' | 'last-session') => {
        set({ startupBehavior: behavior })
      },

      setLastSessionId: (sessionId: string | null) => {
        set({ lastSessionId: sessionId })
      },

      setMaxConcurrentUploads: (max: number) => {
        set({ maxConcurrentUploads: Math.max(1, Math.min(10, max)) })
      },

      setMaxConcurrentDownloads: (max: number) => {
        set({ maxConcurrentDownloads: Math.max(1, Math.min(10, max)) })
      },

      resetToDefaults: () => {
        set(defaultPreferences)
      },
    }),
    {
      name: 'r2browser-preferences',
      storage: sharedPreferencesStorage(),
      partialize: (state) => ({
        updateChannel: state.updateChannel,
        downloadFolder: state.downloadFolder,
        askDownloadLocation: state.askDownloadLocation,
        defaultViewMode: state.defaultViewMode,
        confirmDelete: state.confirmDelete,
        confirmOverwrite: state.confirmOverwrite,
        startupBehavior: state.startupBehavior,
        lastSessionId: state.lastSessionId,
        maxConcurrentUploads: state.maxConcurrentUploads,
        maxConcurrentDownloads: state.maxConcurrentDownloads,
      }),
    }
  )
)
