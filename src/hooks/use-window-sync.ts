import { useEffect, useCallback, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTabStore, TabSession } from '@/stores/tab-store'
import {
  initTabSync,
  emitTabSync,
  createWindowWithTab,
  findWindowAtPosition,
} from '@/lib/tab-sync'

export function useWindowSync() {
  const {
    removeTabById,
    insertTab,
    tabs,
  } = useTabStore()

  const isSetup = useRef(false)

  // Handle dragging a tab out to create new window or merge into existing
  const handleTabDragOut = useCallback(async (
    tabId: string,
    screenX: number,
    screenY: number
  ) => {
    // Don't allow drag-out if this is the only tab
    if (tabs.length <= 1) {
      return
    }

    // Check if dropped on another window
    const targetWindow = await findWindowAtPosition(screenX, screenY)

    if (targetWindow) {
      // Merge into existing window
      const removedTab = removeTabById(tabId)
      if (!removedTab) {
        return
      }

      // Calculate insert index based on mouse position
      // The target window will receive the event and calculate proper index
      // For now, we emit the event with position and let target calculate
      await emitTabSync({
        type: 'TAB_DRAG_IN',
        payload: {
          tabId,
          tab: removedTab,
          screenX,
          screenY,
          // Insert at end by default, target window can recalculate
          insertIndex: -1,
        },
      })
    } else {
      // Create new window with the tab
      const removedTab = removeTabById(tabId)
      if (!removedTab) {
        return
      }

      const newWindow = await createWindowWithTab(removedTab, screenX, screenY)

      if (!newWindow) {
        // If window creation failed, restore the tab
        insertTab(removedTab)
      }
    }
  }, [tabs.length, removeTabById, insertTab])

  // Handle receiving a tab from another window
  const handleTabReceive = useCallback((
    tab: TabSession,
    screenX: number,
    screenY: number
  ) => {
    // Calculate insert index based on mouse position in our tab bar
    // For simplicity, we'll add at the end.
    // A more sophisticated implementation would measure the tab bar
    // and calculate the exact position.
    insertTab(tab)
  }, [insertTab])

  // Set up tab sync event listeners
  useEffect(() => {
    if (isSetup.current) return
    isSetup.current = true

    const cleanup = initTabSync({
      onTabDragIn: (tab: TabSession, _insertIndex: number, sourceWindow: string) => {
        // Only handle if we're the target window
        // The sourceWindow should be different from current
        const currentLabel = getCurrentWindow().label
        if (sourceWindow !== currentLabel) {
          insertTab(tab)
        }
      },
      onWindowClosed: () => {
        // Handle cleanup when another window closes
      },
    })

    // Clean up when window closes
    const currentWindow = getCurrentWindow()
    const handleWindowClose = async () => {
      await emitTabSync({
        type: 'WINDOW_CLOSED',
        payload: {},
      })
    }

    currentWindow.onCloseRequested(handleWindowClose)

    return () => {
      cleanup()
      isSetup.current = false
    }
  }, [insertTab])

  return {
    handleTabDragOut,
    handleTabReceive,
  }
}
