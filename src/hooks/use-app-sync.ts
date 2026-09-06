import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/app-store'
import { usePreferencesStore } from '@/stores/preferences-store'
import { toast } from './use-toast'
import i18n from '@/i18n'

/** Shared records are reloaded from Rust; tabs, selection and clipboard remain local. */
export function useAppSync() {
  const { t } = useTranslation()
  useEffect(() => {
    let disposed = false
    const unlisteners: Array<() => void> = []
    const register = (promise: Promise<() => void>) => {
      void promise.then(fn => { if (disposed) fn(); else unlisteners.push(fn) }).catch(() => undefined)
    }
    register(listen('sessions-changed', () => {
      if (!disposed) { void useAppStore.getState().loadSessions(); void useAppStore.getState().loadSessionStats() }
    }))
    register(listen('profiles-changed', () => { if (!disposed) void useAppStore.getState().loadProfiles() }))
    register(listen('storage-backend-changed', () => {
      if (disposed) return
      useAppStore.setState({ uploads: [], recoveredTaskSessionIds: [], recoveringTaskSessionIds: [] })
      void useAppStore.getState().loadSessions().then(() => useAppStore.getState().autoRecoverTasks())
      void useAppStore.getState().loadProfiles()
    }))
    register(listen('task-owners-changed', () => {
      if (disposed) return
      useAppStore.setState({ recoveredTaskSessionIds: [] })
      void useAppStore.getState().autoRecoverTasks()
    }))
    register(getCurrentWebviewWindow().listen('window-close-blocked', () => {
      if (!disposed) toast({ title: t('window.transfersActive') })
    }))
    // Also protect frontend work still creating its persistent task record.
    register(getCurrentWebviewWindow().onCloseRequested(event => {
      event.preventDefault()
      if (disposed) return
      if (useAppStore.getState().pendingTaskCreations > 0 || useAppStore.getState().uploads.some(task => task.status === 'pending' || task.status === 'uploading')) {
        toast({ title: t('window.transfersActive') })
      } else {
        void invoke('finish_window_close').catch(() => toast({ title: t('window.transfersActive') }))
      }
    }))
    const refresh = () => {
      if (disposed || !useAppStore.getState().isInitialized) return
      void useAppStore.getState().loadSessions()
      void useAppStore.getState().loadProfiles()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'r2browser-preferences') void usePreferencesStore.persist.rehydrate()
      if (event.key === 'r2browser-storage') void useAppStore.persist.rehydrate()
      if (event.key === 'r2browser-language' && event.newValue && event.newValue !== i18n.language) void i18n.changeLanguage(event.newValue)
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      disposed = true
      unlisteners.forEach(fn => fn())
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [t])
}
