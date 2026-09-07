import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { logger } from '../lib/logger'
import { useAppStore } from '../stores/app-store'
import { usePreferencesStore } from '../stores/preferences-store'

export type UpdateChannel = 'stable' | 'beta'

interface UpdateInfo {
  currentVersion: string
  version: string
  body?: string | null
  date?: string | null
  channel: UpdateChannel
}

interface UpdateDownloadEvent {
  event: 'Started' | 'Progress' | 'Finished'
  data?: {
    contentLength?: number
    chunkLength?: number
  }
}

export interface UpdateStatus {
  checking: boolean
  available: boolean
  downloading: boolean
  readyToInstall: boolean
  error: string | null
  currentVersion: string
  latestVersion: string | null
  updateInfo: UpdateInfo | null
  channel: UpdateChannel
  downloadProgress: number | null
  downloadedBytes: number
  totalBytes: number | null
}

const UPDATE_DOWNLOAD_EVENT = 'app-update://download'

export function useUpdater() {
  const { appInfo } = useAppStore()
  const { updateChannel } = usePreferencesStore()
  const operation = useRef<'check' | 'install' | null>(null)
  const installed = useRef(false)
  const checkGeneration = useRef(0)
  const [status, setStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    downloading: false,
    readyToInstall: false,
    error: null,
    currentVersion: appInfo?.version ?? '0.1.0',
    latestVersion: null,
    updateInfo: null,
    channel: updateChannel,
    downloadProgress: null,
    downloadedBytes: 0,
    totalBytes: null,
  })

  useEffect(() => {
    checkGeneration.current += 1
    setStatus((prev) => prev.downloading || prev.readyToInstall ? {
      ...prev,
      currentVersion: appInfo?.version ?? prev.currentVersion,
    } : ({
      ...prev,
      channel: updateChannel,
      currentVersion: appInfo?.version ?? prev.currentVersion,
      available: false,
      latestVersion: null,
      updateInfo: null,
      readyToInstall: prev.readyToInstall,
      downloading: prev.downloading,
      checking: false,
      downloadProgress: null,
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    }))
  }, [appInfo?.version, updateChannel])

  useEffect(() => {
    let downloadedBytes = 0
    let disposed = false

    const unlistenPromise = getCurrentWebviewWindow().listen<UpdateDownloadEvent>(UPDATE_DOWNLOAD_EVENT, (event) => {
      if (disposed) return
      const payload = event.payload

      switch (payload.event) {
        case 'Started': {
          downloadedBytes = 0
          const totalBytes = payload.data?.contentLength ?? null
          setStatus((prev) => ({
            ...prev,
            totalBytes,
            downloadedBytes: 0,
            downloadProgress: totalBytes ? 0 : null,
          }))
          break
        }
        case 'Progress': {
          downloadedBytes += payload.data?.chunkLength ?? 0
          setStatus((prev) => ({
            ...prev,
            downloadedBytes,
            downloadProgress: prev.totalBytes
              ? Math.min(100, (downloadedBytes / prev.totalBytes) * 100)
              : null,
          }))
          break
        }
        case 'Finished': {
          setStatus((prev) => ({
            ...prev,
            downloadedBytes: prev.totalBytes ?? prev.downloadedBytes,
            downloadProgress: prev.totalBytes ? 100 : prev.downloadProgress,
          }))
          break
        }
      }
    })

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten()).catch(() => undefined)
    }
  }, [])

  const checkForUpdates = useCallback(async (silent = false) => {
    if (operation.current || installed.current) return null
    operation.current = 'check'
    const generation = ++checkGeneration.current
    const isCurrent = () => generation === checkGeneration.current && usePreferencesStore.getState().updateChannel === updateChannel
    try {
      setStatus((prev) => ({
        ...prev,
        checking: true,
        error: null,
        available: false,
        readyToInstall: false,
        latestVersion: null,
        updateInfo: null,
        downloadProgress: null,
        downloadedBytes: 0,
        totalBytes: null,
      }))

      if (!silent) {
        logger.info(`Checking ${updateChannel} updates...`)
      }

      const update = await invoke<UpdateInfo | null>('check_for_app_update', {
        channel: updateChannel,
      })

      if (!isCurrent()) return null
      if (update) {
        logger.info(`Update available on ${updateChannel} channel: ${update.version}`)
        setStatus((prev) => ({
          ...prev,
          checking: false,
          available: true,
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          updateInfo: update,
        }))
        return update
      }

      if (!silent) {
        logger.info(`No ${updateChannel} updates available`)
      }

      setStatus((prev) => ({
        ...prev,
        checking: false,
        currentVersion: appInfo?.version ?? prev.currentVersion,
      }))
      return null
    } catch (error) {
      if (!isCurrent()) return null
      const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to check for updates'
      logger.logError(error, 'Update check failed')
      setStatus((prev) => ({
        ...prev,
        checking: false,
        error: errorMessage,
      }))
      return null
    } finally {
      operation.current = null
    }
  }, [appInfo?.version, updateChannel])

  const downloadAndInstall = useCallback(async () => {
    if (operation.current || installed.current) return false
    if (!status.updateInfo || status.updateInfo.channel !== usePreferencesStore.getState().updateChannel) {
      logger.error('No update available to install')
      return false
    }

    operation.current = 'install'
    try {
      setStatus((prev) => ({
        ...prev,
        downloading: true,
        readyToInstall: false,
        error: null,
        downloadProgress: null,
        downloadedBytes: 0,
        totalBytes: null,
      }))
      logger.info(`Downloading ${status.channel} update ${status.updateInfo.version}...`)

      await invoke('download_and_install_app_update', { channel: status.updateInfo.channel, expectedVersion: status.updateInfo.version })

      installed.current = true
      setStatus((prev) => ({
        ...prev,
        downloading: false,
        readyToInstall: true,
      }))

      logger.info('Update installed and ready to restart')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to download update'
      logger.logError(error, 'Update download failed')
      setStatus((prev) => ({
        ...prev,
        downloading: false,
        error: errorMessage,
      }))
      return false
    } finally {
      operation.current = null
    }
  }, [status.channel, status.updateInfo])

  const installAndRestart = useCallback(async () => {
    try {
      logger.info('Restarting application to finish update...')
      await invoke('restart_after_update')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to restart application'
      logger.logError(error, 'Restart failed')
      setStatus((prev) => ({
        ...prev,
        error: errorMessage,
      }))
    }
  }, [])

  const updateAndRestart = useCallback(async () => {
    const success = await downloadAndInstall()
    if (success) {
      await installAndRestart()
    }
  }, [downloadAndInstall, installAndRestart])

  useEffect(() => {
    if (import.meta.env.DEV) {
      return
    }

    // Only the original window checks automatically; other windows use the explicit action.
    if (getCurrentWebviewWindow().label !== 'main') return
    const timer = setTimeout(() => { void checkForUpdates(true) }, 5000)
    return () => clearTimeout(timer)
  }, [checkForUpdates])

  return {
    status,
    checkForUpdates,
    downloadAndInstall,
    installAndRestart,
    updateAndRestart,
  }
}
