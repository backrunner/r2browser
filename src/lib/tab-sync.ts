import { emit, emitTo, UnlistenFn } from '@tauri-apps/api/event'
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { TabSession } from '@/stores/tab-store'
import { logger } from './logger'

const TAB_SYNC_EVENT = 'tab-sync'
const WINDOW_MERGE_ZONE_HEIGHT = 32
const DEFAULT_WINDOW_WIDTH = 1200
const DEFAULT_WINDOW_HEIGHT = 800

export type TabSyncEventType = 'TAB_TRANSFER' | 'WINDOW_CLOSED'

export interface TabSyncEvent {
  type: TabSyncEventType
  sourceWindow: string
  payload: {
    tab?: TabSession
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

export interface WindowBoundsResponse {
  windows: WindowBounds[]
  globalCoordinatesSupported: boolean
}

let hasLoggedUnsupportedWindowCoordinates = false

export async function emitTabSync(event: Omit<TabSyncEvent, 'sourceWindow'>): Promise<void> {
  const currentWindow = getCurrentWebviewWindow()
  const fullEvent: TabSyncEvent = {
    ...event,
    sourceWindow: currentWindow.label,
  }

  await emit(TAB_SYNC_EVENT, fullEvent)
}

export async function emitTabSyncTo(
  targetLabel: string,
  event: Omit<TabSyncEvent, 'sourceWindow'>
): Promise<void> {
  const currentWindow = getCurrentWebviewWindow()
  const fullEvent: TabSyncEvent = {
    ...event,
    sourceWindow: currentWindow.label,
  }

  await emitTo(targetLabel, TAB_SYNC_EVENT, fullEvent)
}

export async function getAllWindowBounds(): Promise<WindowBoundsResponse> {
  try {
    return await invoke<WindowBoundsResponse>('get_all_window_bounds')
  } catch (error) {
    await logger.warn('Failed to get window bounds', 'tab-sync', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      windows: [],
      globalCoordinatesSupported: false,
    }
  }
}

export async function findWindowAtPosition(
  screenX: number,
  screenY: number,
  excludeLabel?: string
): Promise<WindowBounds | null> {
  const { windows: bounds, globalCoordinatesSupported } = await getAllWindowBounds()
  const currentWindow = getCurrentWebviewWindow()
  const excludeWindowLabel = excludeLabel || currentWindow.label

  if (!globalCoordinatesSupported && bounds.length === 0 && !hasLoggedUnsupportedWindowCoordinates) {
    hasLoggedUnsupportedWindowCoordinates = true
    await logger.info(
      'Window merge detection is unavailable because global window coordinates are not supported in this desktop session',
      'tab-sync',
      { excludeWindowLabel }
    )
  }

  for (const win of bounds) {
    if (win.label === excludeWindowLabel) {
      continue
    }

    const withinHorizontalBounds =
      screenX >= win.x &&
      screenX <= win.x + win.width
    const withinTabMergeZone =
      screenY >= win.y &&
      screenY <= win.y + WINDOW_MERGE_ZONE_HEIGHT

    if (
      withinHorizontalBounds &&
      withinTabMergeZone
    ) {
      return win
    }
  }

  return null
}

export function buildManagerWindowUrl(sessionId: string, path = ''): string {
  const params = new URLSearchParams()
  if (path) {
    params.set('path', path)
  }

  const query = params.toString()
  return `/manager/${sessionId}${query ? `?${query}` : ''}`
}

interface CreateSessionWindowOptions {
  sessionId: string
  path?: string
  title: string
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  x?: number
  y?: number
}

export async function createSessionWindow({
  sessionId,
  path = '',
  title,
  width = DEFAULT_WINDOW_WIDTH,
  height = DEFAULT_WINDOW_HEIGHT,
  minWidth,
  minHeight,
  x,
  y,
}: CreateSessionWindowOptions): Promise<WebviewWindow | null> {
  try {
    const windowLabel = `manager-${Date.now()}`
    const webview = new WebviewWindow(windowLabel, {
      url: buildManagerWindowUrl(sessionId, path),
      title,
      width,
      height,
      x,
      y,
      minWidth,
      minHeight,
      decorations: false,
      titleBarStyle: 'overlay',
      hiddenTitle: true,
      transparent: false,
      center: false,
    })

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

    return webview
  } catch (error) {
    await logger.error('Failed to create session window', 'tab-sync', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      path,
    })
    return null
  }
}

export async function createWindowWithTab(
  tab: TabSession,
  screenX: number,
  screenY: number
): Promise<WebviewWindow | null> {
  return createSessionWindow({
    sessionId: tab.session.id,
    path: tab.path,
    title: 'R2 Browser',
    x: screenX - 100,
    y: screenY - 20,
  })
}

export function initTabSync(
  handlers: {
    onTabTransfer?: (tab: TabSession, sourceWindow: string, screenX?: number, screenY?: number) => void
    onWindowClosed?: (windowLabel: string) => void
  }
): () => void {
  let unlisten: UnlistenFn | null = null
  const currentWindow = getCurrentWebviewWindow()

  const setupListener = async () => {
    unlisten = await currentWindow.listen<TabSyncEvent>(TAB_SYNC_EVENT, (event) => {
      const { type, sourceWindow, payload } = event.payload

      if (sourceWindow === currentWindow.label) {
        return
      }

      switch (type) {
        case 'TAB_TRANSFER':
          if (payload.tab && handlers.onTabTransfer) {
            handlers.onTabTransfer(payload.tab, sourceWindow, payload.screenX, payload.screenY)
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

  void setupListener()

  // Return cleanup function
  return () => {
    if (unlisten) {
      unlisten()
    }
  }
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
