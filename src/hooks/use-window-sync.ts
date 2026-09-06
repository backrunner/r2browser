import { useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTabStore } from '@/stores/tab-store'
import { useAppStore } from '@/stores/app-store'
import { initTabSync, transferTabToWindow, createWindowWithTab, findWindowAtPosition } from '@/lib/tab-sync'
import { resolveTabBarDropIndex } from '@/components/layout/tab-bar-drop'
import { logger } from '@/lib/logger'
import { toast } from '@/hooks/use-toast'
import { useTranslation } from 'react-i18next'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export function useWindowSync() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const transferringTabs = useRef(new Set<string>())

  const syncAfterRemoval = useCallback((removedWasActive: boolean) => {
    const tab = useTabStore.getState().getActiveTab()
    const app = useAppStore.getState()
    if (!tab) {
      app.setCurrentSession(null)
      navigate('/')
    } else if (removedWasActive) {
      app.setCurrentSession(tab.session)
      void app.navigateToPath(tab.path)
      navigate(`/manager/${encodeURIComponent(tab.session.id)}`)
    }
  }, [navigate])

  const moveTab = useCallback(async (tabId: string, targetWindow?: string, screenX?: number, screenY?: number, index?: number) => {
    if (transferringTabs.current.has(tabId)) return
    const tab = useTabStore.getState().tabs.find(item => item.tabId === tabId)
    if (!tab) return
    transferringTabs.current.add(tabId)
    try {
      let target = targetWindow
      if (!target) {
        const existing = await findWindowAtPosition(screenX ?? 0, screenY ?? 0)
        target = existing?.label ?? (await createWindowWithTab(tab, screenX ?? 100, screenY ?? 100)).label
      }
      await transferTabToWindow(target, tab, screenX, index)
      const currentTab = useTabStore.getState().tabs.find(item => item.tabId === tabId)
      // Navigation during a slow transfer must not discard the user's newer state.
      if (currentTab?.path !== tab.path) return
      const removed = useTabStore.getState().removeTabById(tabId)
      if (removed) syncAfterRemoval(removed.isActive)
    } catch (error) {
      void logger.error('Failed to transfer tab', 'window-sync', { error })
      toast({ title: t('tabs.transferFailed'), description: t('tabs.sourceKept'), variant: 'destructive' })
    } finally {
      transferringTabs.current.delete(tabId)
    }
  }, [syncAfterRemoval, t])

  useEffect(() => initTabSync({
    isReady: () => useAppStore.getState().isInitialized,
    onTabDropRequest: (tabId, target, index) => { void moveTab(tabId, target, undefined, undefined, index) },
    onTabTransfer: async (tab, screenX, index) => {
      await useAppStore.getState().loadSessions()
      const session = useAppStore.getState().sessions.find(item => item.id === tab.sessionId)
      if (!session) throw new Error('The connection no longer exists')
      const insertIndex = index ?? (screenX === undefined ? undefined : resolveTabBarDropIndex(screenX) ?? undefined)
      useTabStore.getState().insertTab({ tabId: tab.tabId, session, path: tab.path, isActive: true }, insertIndex)
      const app = useAppStore.getState()
      app.setCurrentSession(session)
      void app.navigateToPath(tab.path)
      navigate(`/manager/${encodeURIComponent(session.id)}`)
      void getCurrentWebviewWindow().setFocus().catch(() => undefined)
    },
  }), [moveTab, navigate])

  return {
    handleTabDragOut: (tabId: string, screenX: number, screenY: number) => { void moveTab(tabId, undefined, screenX, screenY) },
  }
}
