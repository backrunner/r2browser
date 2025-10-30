import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { logError } from '@/lib/logger'

interface PreferencesState {
  // Download settings
  downloadFolder: string | null
  askDownloadLocation: boolean

  // Actions
  setDownloadFolder: (folder: string | null) => void
  setAskDownloadLocation: (ask: boolean) => void
  getDefaultDownloadFolder: () => Promise<string>
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      // Initial state
      downloadFolder: null, // null means use system default
      askDownloadLocation: false, // Use default download folder by default

      // Actions
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
    }),
    {
      name: 'r2browser-preferences',
      partialize: (state) => ({
        downloadFolder: state.downloadFolder,
        askDownloadLocation: state.askDownloadLocation,
      }),
    }
  )
)
