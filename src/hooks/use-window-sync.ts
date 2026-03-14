import { useEffect, useCallback, useRef } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useNavigate } from 'react-router-dom'
import { useTabStore } from '@/stores/tab-store'
import { useAppStore } from '@/stores/app-store'
import {
  initTabSync,
  emitTabSync,
  emitTabSyncTo,
  createWindowWithTab,
  findWindowAtPosition,
} from '@/lib/tab-sync'
import { resolveTabBarDropIndex } from '@/components/layout/tab-bar-drop'
import { logger } from '@/lib/logger'

export function useWindowSync() {
  const {
    removeTabById,
    insertTab,
  } = useTabStore()
  const navigate = useNavigate()
  const { setCurrentSession, navigateToPath } = useAppStore()

  const isSetup = useRef(false)

  const syncCurrentWindowAfterTabRemoval = useCallback((removedWasActive: boolean) => {
    const { tabs, activeTabId } = useTabStore.getState()

    if (tabs.length === 0 || !activeTabId) {
      setCurrentSession(null)
      navigate('/')
      return
    }

    if (!removedWasActive) {
      return
    }

    const nextActiveTab = tabs.find((tab) => tab.tabId === activeTabId)
    if (!nextActiveTab) {
      setCurrentSession(null)
      navigate('/')
      return
    }

    setCurrentSession(nextActiveTab.session)
    void navigateToPath(nextActiveTab.path)
    navigate(`/manager/${nextActiveTab.session.id}`)
  }, [navigate, navigateToPath, setCurrentSession])

  const handleTabDragOut = useCallback(async (
    tabId: string,
    screenX: number,
    screenY: number
  ) => {
    const sourceTabs = useTabStore.getState().tabs
    const removedTabIndex = sourceTabs.findIndex((tab) => tab.tabId === tabId)
    if (removedTabIndex === -1) return

    const targetWindow = await findWindowAtPosition(screenX, screenY)

    if (targetWindow) {
      const removedTab = removeTabById(tabId)
      if (!removedTab) {
        return
      }

      try {
        await emitTabSyncTo(targetWindow.label, {
          type: 'TAB_TRANSFER',
          payload: {
            tab: removedTab,
            screenX,
            screenY,
          },
        })

        syncCurrentWindowAfterTabRemoval(removedTab.isActive)
      } catch (error) {
        insertTab(removedTab, removedTabIndex)
        await logger.error('Failed to transfer tab to existing window', 'window-sync', {
          targetWindow: targetWindow.label,
          tabId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      const removedTab = removeTabById(tabId)
      if (!removedTab) {
        return
      }

      const newWindow = await createWindowWithTab(removedTab, screenX, screenY)

      if (!newWindow) {
        insertTab(removedTab, removedTabIndex)
      } else {
        syncCurrentWindowAfterTabRemoval(removedTab.isActive)
      }
    }
  }, [insertTab, removeTabById, syncCurrentWindowAfterTabRemoval])

  useEffect(() => {
    if (isSetup.current) return
    isSetup.current = true

    const cleanup = initTabSync({
      onTabTransfer: (tab, sourceWindow, screenX) => {
        const insertIndex = screenX !== undefined
          ? resolveTabBarDropIndex(screenX) ?? undefined
          : undefined

        insertTab(tab, insertIndex)
        setCurrentSession(tab.session)
        void navigateToPath(tab.path)
        void logger.info('Received tab transfer', 'window-sync', {
          sourceWindow,
          sessionId: tab.session.id,
          tabId: tab.tabId,
          insertIndex: insertIndex ?? 'end',
        })
        navigate(`/manager/${tab.session.id}`)
      },
      onWindowClosed: () => {
        // Reserved for future cleanup when window-scoped resources are added.
      },
    })

    const currentWindow = getCurrentWebviewWindow()
    let unlistenCloseRequested: (() => void) | null = null
    const handleWindowClose = async () => {
      await emitTabSync({
        type: 'WINDOW_CLOSED',
        payload: {},
      })
    }

    void currentWindow.onCloseRequested(handleWindowClose).then((unlisten) => {
      unlistenCloseRequested = unlisten
    })

    return () => {
      cleanup()
      unlistenCloseRequested?.()
      isSetup.current = false
    }
  }, [insertTab, navigate, navigateToPath, setCurrentSession])

  return {
    handleTabDragOut,
  }
}
