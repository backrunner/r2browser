import { emit, listen, UnlistenFn } from '@tauri-apps/api/event'
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { TabSession } from '@/stores/tab-store'

// Event types for tab synchronization across windows
export type TabSyncEventType =
  | 'TAB_OPENED'
  | 'TAB_CLOSED'
  | 'TAB_MOVED'
  | 'TAB_UPDATED'
  | 'WINDOW_CLOSED'
  | 'TAB_DRAG_OUT'
  | 'TAB_DRAG_IN'
  | 'TAB_DRAG_POSITION' // For broadcasting drag position during merge detection

export interface TabSyncEvent {
  type: TabSyncEventType
  sourceWindow: string
  payload: {
    tabId?: string
    tab?: TabSession
    insertIndex?: number
    screenX?: number
    screenY?: number
  }
}

// Window bounds from Rust backend
export interface WindowBounds {
  label: string
  x: number
  y: number
  width: number
  height: number
}

// Emit a tab sync event to all windows
export async function emitTabSync(event: Omit<TabSyncEvent, 'sourceWindow'>): Promise<void> {
  const currentWindow = getCurrentWebviewWindow()
  const fullEvent: TabSyncEvent = {
    ...event,
    sourceWindow: currentWindow.label,
  }

  await emit('tab-sync', fullEvent)
}

// Get all window bounds from Rust backend
export async function getAllWindowBounds(): Promise<WindowBounds[]> {
  try {
    return await invoke<WindowBounds[]>('get_all_window_bounds')
  } catch (error) {
    console.error('Failed to get window bounds:', error)
    return []
  }
}

// Find which window a point is inside (excluding current window)
export async function findWindowAtPosition(
  screenX: number,
  screenY: number,
  excludeLabel?: string
): Promise<WindowBounds | null> {
  const bounds = await getAllWindowBounds()
  const currentWindow = getCurrentWebviewWindow()
  const excludeWindowLabel = excludeLabel || currentWindow.label

  for (const win of bounds) {
    // Skip the current window
    if (win.label === excludeWindowLabel) {
      continue
    }

    // Check if point is inside this window
    if (
      screenX >= win.x &&
      screenX <= win.x + win.width &&
      screenY >= win.y &&
      screenY <= win.y + win.height
    ) {
      return win
    }
  }

  return null
}

// Create a new window with a tab
export async function createWindowWithTab(
  tab: TabSession,
  screenX: number,
  screenY: number
): Promise<WebviewWindow | null> {
  try {
    const windowLabel = `manager-${Date.now()}`

    // Create new window at the drag location
    const webview = new WebviewWindow(windowLabel, {
      url: `/manager/${tab.session.id}`,
      title: 'R2 Browser',
      width: 1200,
      height: 800,
      x: screenX - 100, // Offset to center on cursor
      y: screenY - 20,
      decorations: false,
      titleBarStyle: 'overlay',
      hiddenTitle: true,
      transparent: false,
      center: false,
    })

    // Wait for window to be created
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Window creation timeout')), 5000)

      webview.once('tauri://created', () => {
        clearTimeout(timeout)
        resolve()
      })

      webview.once('tauri://error', (e: unknown) => {
        clearTimeout(timeout)
        reject(e)
      })
    })

    // Emit event so the new window knows about the tab
    await emitTabSync({
      type: 'TAB_DRAG_OUT',
      payload: {
        tabId: tab.tabId,
        tab,
        screenX,
        screenY,
      },
    })

    return webview
  } catch (error) {
    console.error('Failed to create window with tab:', error)
    return null
  }
}

// Listen for tab sync events
export function initTabSync(
  handlers: {
    onTabOpened?: (tab: TabSession, sourceWindow: string) => void
    onTabClosed?: (tabId: string, sourceWindow: string) => void
    onTabMoved?: (tabId: string, sourceWindow: string) => void
    onTabDragIn?: (tab: TabSession, insertIndex: number, sourceWindow: string) => void
    onWindowClosed?: (windowLabel: string) => void
  }
): () => void {
  let unlisten: UnlistenFn | null = null
  const currentWindow = getCurrentWebviewWindow()

  const setupListener = async () => {
    unlisten = await listen<TabSyncEvent>('tab-sync', (event) => {
      const { type, sourceWindow, payload } = event.payload

      // Ignore events from the current window
      if (sourceWindow === currentWindow.label) {
        return
      }

      switch (type) {
        case 'TAB_OPENED':
          if (payload.tab && handlers.onTabOpened) {
            handlers.onTabOpened(payload.tab, sourceWindow)
          }
          break
        case 'TAB_CLOSED':
          if (payload.tabId && handlers.onTabClosed) {
            handlers.onTabClosed(payload.tabId, sourceWindow)
          }
          break
        case 'TAB_MOVED':
          if (payload.tabId && handlers.onTabMoved) {
            handlers.onTabMoved(payload.tabId, sourceWindow)
          }
          break
        case 'TAB_DRAG_IN':
          if (payload.tab && payload.insertIndex !== undefined && handlers.onTabDragIn) {
            handlers.onTabDragIn(payload.tab, payload.insertIndex, sourceWindow)
          }
          break
        case 'WINDOW_CLOSED':
          if (handlers.onWindowClosed) {
            handlers.onWindowClosed(sourceWindow)
          }
          break
      }
    })
  }

  setupListener()

  // Return cleanup function
  return () => {
    if (unlisten) {
      unlisten()
    }
  }
}

// Get all window bounds for drop target detection
export interface WindowBounds {
  label: string
  x: number
  y: number
  width: number
  height: number
}

// Check if a point is inside window bounds
export function isPointInWindow(
  x: number,
  y: number,
  bounds: WindowBounds
): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  )
}
