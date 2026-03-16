import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { relaunch } from '@tauri-apps/plugin-process'
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
    setStatus((prev) => ({
      ...prev,
      channel: updateChannel,
      currentVersion: appInfo?.version ?? prev.currentVersion,
      available: false,
      latestVersion: null,
      updateInfo: null,
      readyToInstall: false,
      downloading: false,
      downloadProgress: null,
      downloadedBytes: 0,
      totalBytes: null,
      error: null,
    }))
  }, [appInfo?.version, updateChannel])

  useEffect(() => {
    let downloadedBytes = 0

    const unlistenPromise = listen<UpdateDownloadEvent>(UPDATE_DOWNLOAD_EVENT, (event) => {
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
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  const checkForUpdates = useCallback(async (silent = false) => {
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to check for updates'
      logger.logError(error, 'Update check failed')
      setStatus((prev) => ({
        ...prev,
        checking: false,
        error: errorMessage,
      }))
      return null
    }
  }, [appInfo?.version, updateChannel])

  const downloadAndInstall = useCallback(async () => {
    if (!status.updateInfo) {
      logger.error('No update available to install')
      return false
    }

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

      await invoke('download_and_install_app_update')

      setStatus((prev) => ({
        ...prev,
        downloading: false,
        readyToInstall: true,
      }))

      logger.info('Update installed and ready to restart')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download update'
      logger.logError(error, 'Update download failed')
      setStatus((prev) => ({
        ...prev,
        downloading: false,
        error: errorMessage,
      }))
      return false
    }
  }, [status.channel, status.updateInfo])

  const installAndRestart = useCallback(async () => {
    try {
      logger.info('Restarting application to finish update...')
      await relaunch()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to restart application'
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

    const autoCheck = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await checkForUpdates(true)
    }

    void autoCheck()
  }, [checkForUpdates])

  return {
    status,
    checkForUpdates,
    downloadAndInstall,
    installAndRestart,
    updateAndRestart,
  }
}
