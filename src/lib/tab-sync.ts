import { emitTo, UnlistenFn } from '@tauri-apps/api/event'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import { TabSession } from '@/stores/tab-store'
import { logger } from './logger'

const TAB_SYNC_EVENT = 'tab-sync'
const WINDOW_MERGE_ZONE_HEIGHT = 32
const DEFAULT_WINDOW_WIDTH = 1200
const DEFAULT_WINDOW_HEIGHT = 800
const MACOS_TRAFFIC_LIGHT_X = 13
const MACOS_TRAFFIC_LIGHT_Y = 18

function isMacOS(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

function getWindowChromeOptions() {
  if (isMacOS()) {
    return {
      decorations: true,
      titleBarStyle: 'overlay' as const,
      hiddenTitle: true,
      trafficLightPosition: new LogicalPosition(MACOS_TRAFFIC_LIGHT_X, MACOS_TRAFFIC_LIGHT_Y),
      shadow: true,
    }
  }

  return {
    decorations: false,
    shadow: true,
  }
}

export type TabSyncEventType = 'TAB_TRANSFER' | 'TAB_TRANSFER_ACK' | 'TAB_DROP_REQUEST'

export const TAB_DRAG_MIME = 'application/x-r2browser-tab'

export interface TransferredTab {
  tabId: string
  sessionId: string
  path: string
}

export interface TabSyncEvent {
  type: TabSyncEventType
  sourceWindow: string
  payload: {
    tab?: TransferredTab
    screenX?: number
    screenY?: number
    transferId?: string
    deadline?: number
    index?: number
    tabId?: string
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

function createTransferId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Register the ACK listener first; keep the source tab until the destination accepts. */
export async function transferTabToWindow(
  targetLabel: string, tab: TabSession, screenX?: number, index?: number, timeoutMs = 15000
): Promise<void> {
  const transferId = createTransferId()
  const deadline = Date.now() + timeoutMs
  let timer: ReturnType<typeof setTimeout> | undefined
  let retry: ReturnType<typeof setInterval> | undefined
  let resolveResponse!: () => void
  let rejectResponse!: (error: unknown) => void
  const response = new Promise<void>((resolve, reject) => {
    resolveResponse = resolve
    rejectResponse = reject
  })
  const unlisten = await getCurrentWebviewWindow().listen<TabSyncEvent>(TAB_SYNC_EVENT, ({ payload }) => {
    if (payload.type === 'TAB_TRANSFER_ACK' && payload.sourceWindow === targetLabel && payload.payload.transferId === transferId) resolveResponse()
  })
  try {
    const send = () => {
      void emitTabSyncTo(targetLabel, {
        type: 'TAB_TRANSFER',
        payload: { tab: { tabId: tab.tabId, sessionId: tab.session.id, path: tab.path }, screenX, index, transferId, deadline },
      }).catch(rejectResponse)
    }
    timer = setTimeout(() => rejectResponse(new Error('The target window did not respond. The source tab has been kept.')), timeoutMs)
    retry = setInterval(send, 250)
    send()
    await response
  } finally {
    clearTimeout(timer)
    clearInterval(retry)
    unlisten()
  }
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

  if (!globalCoordinatesSupported) return null

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
  return `/manager/${encodeURIComponent(sessionId)}${query ? `?${query}` : ''}`
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
  minWidth = 800,
  minHeight = 600,
  x,
  y,
}: CreateSessionWindowOptions): Promise<WebviewWindow> {
  try {
    const windowLabel = `manager-${createTransferId()}`
    const webview = new WebviewWindow(windowLabel, {
      url: buildManagerWindowUrl(sessionId, path),
      title,
      width,
      height,
      x,
      y,
      minWidth,
      minHeight,
      transparent: false,
      center: x === undefined && y === undefined,
      ...getWindowChromeOptions(),
    })

    const listeners: UnlistenFn[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Window creation timeout')), 15000)
        void webview.once('tauri://created', () => resolve()).then(fn => listeners.push(fn), reject)
        void webview.once('tauri://error', event => reject(new Error(String(event.payload)))).then(fn => listeners.push(fn), reject)
      })
    } finally {
      clearTimeout(timer)
      listeners.forEach(fn => fn())
    }

    return webview
  } catch (error) {
    await logger.error('Failed to create session window', 'tab-sync', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      path,
    })
    throw error
  }
}

export async function createWindowWithTab(
  tab: TabSession,
  screenX: number,
  screenY: number
): Promise<WebviewWindow> {
  return createSessionWindow({
    sessionId: tab.session.id,
    path: tab.path,
    title: 'R2 Browser',
    x: screenX - 100,
    y: screenY - 20,
  })
}

// Deduplicate retries even if a React effect remounts while a transfer is pending.
const acceptedTransfers = new Map<string, Promise<void>>()
export function initTabSync(handlers: {
  isReady: () => boolean
  onTabTransfer: (tab: TransferredTab, screenX?: number, index?: number) => Promise<void>
  onTabDropRequest: (tabId: string, targetWindow: string, index?: number) => void
}): () => void {
  let disposed = false
  let unlisten: UnlistenFn | undefined
  const currentWindow = getCurrentWebviewWindow()
  void currentWindow.listen<TabSyncEvent>(TAB_SYNC_EVENT, ({ payload: event }) => {
    const { type, sourceWindow, payload } = event
    if (disposed || sourceWindow === currentWindow.label) return
    if (type === 'TAB_DROP_REQUEST' && payload.tabId) {
      handlers.onTabDropRequest(payload.tabId, sourceWindow, payload.index)
      return
    }
    if (type !== 'TAB_TRANSFER' || !payload.tab || !handlers.isReady() || !payload.transferId || !payload.deadline || Date.now() > payload.deadline) return
    const transferId = payload.transferId
    const key = `${sourceWindow}:${transferId}`
    let accepted = acceptedTransfers.get(key)
    if (!accepted) {
      accepted = handlers.onTabTransfer(payload.tab, payload.screenX, payload.index)
      acceptedTransfers.set(key, accepted)
      setTimeout(() => acceptedTransfers.delete(key), 60000)
    }
    void accepted.then(() => emitTabSyncTo(sourceWindow, { type: 'TAB_TRANSFER_ACK', payload: { transferId } })).catch(error => {
      void logger.error('Could not receive tab', 'window-sync', { error })
    })
  }).then(fn => {
    if (disposed) fn()
    else unlisten = fn
  }).catch(error => { void logger.error('Could not register window listener', 'window-sync', { error }) })
  return () => { disposed = true; unlisten?.() }
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
