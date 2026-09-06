import { useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab } from './Tab'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { TAB_DRAG_MIME, emitTabSyncTo } from '@/lib/tab-sync'
import { registerTabBarDropResolver } from './tab-bar-drop'
import { windowStartDragging, windowToggleMaximize } from '@/lib/window'

export interface WindowTab {
  id: string
  sessionId: string
  name: string
  path: string
}

interface TabBarProps {
  tabs: WindowTab[]
  activeTabId: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabReorder: (tabId: string, newIndex: number) => void
  onTabDragOut?: (tabId: string, screenX: number, screenY: number) => void
  onNewTab: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onTabDragOut,
  onNewTab,
}: TabBarProps) {
  const { t } = useTranslation()
  const tabBarRef = useRef<HTMLDivElement>(null)
  const dragCancelled = useRef(false)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  // Live region announcement state
  const [announcement, setAnnouncement] = useState<string>('')

  const announce = useCallback((message: string) => {
    setAnnouncement('')
    // Small delay to ensure screen readers pick up the change
    requestAnimationFrame(() => {
      setAnnouncement(message)
    })
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    dragCancelled.current = false
    setDraggedTabId(tabId)
    e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify({ tabId, sourceWindow: getCurrentWebviewWindow().label }))
    // Add a drag image
    const target = e.currentTarget as HTMLElement
    if (target) {
      e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2)
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent, tabId: string) => {
    // A successful DOM drop handles merging itself, including mixed-DPI/Wayland desktops.
    // Ignore cancelled drags that report the browser's sentinel (0, 0) coordinates.
    const outsideWindow = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight
    if (!dragCancelled.current && e.dataTransfer.dropEffect !== 'move' && outsideWindow && (e.screenX !== 0 || e.screenY !== 0)) {
      onTabDragOut?.(tabId, e.screenX, e.screenY)
    }

    setDraggedTabId(null)
    setDropTargetIndex(null)
  }, [onTabDragOut])

  useEffect(() => {
    const cancelDrag = (event: KeyboardEvent) => { if (event.key === 'Escape') dragCancelled.current = true }
    window.addEventListener('keydown', cancelDrag, true)
    return () => window.removeEventListener('keydown', cancelDrag, true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedTabId) {
      setDropTargetIndex(targetIndex)
    }
  }, [draggedTabId])

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (!draggedTabId) {
      try {
        const data: unknown = JSON.parse(e.dataTransfer.getData(TAB_DRAG_MIME))
        if (typeof data === 'object' && data !== null && 'sourceWindow' in data && 'tabId' in data && typeof data.sourceWindow === 'string' && typeof data.tabId === 'string') {
          e.dataTransfer.dropEffect = 'move'
          void emitTabSyncTo(data.sourceWindow, { type: 'TAB_DROP_REQUEST', payload: { tabId: data.tabId, index: Math.max(0, tabs.findIndex(tab => tab.id === targetTabId)) } }).catch(() => undefined)
        }
      } catch { /* An external file drop is handled by the file manager. */ }
      return
    }
    if (draggedTabId === targetTabId) {
      setDropTargetIndex(null)
      return
    }

    const targetIndex = tabs.findIndex(t => t.id === targetTabId)
    if (targetIndex !== -1) {
      onTabReorder(draggedTabId, targetIndex)
      announce(t('tabs.tabMoved', { position: targetIndex + 1 }))
    }

    setDraggedTabId(null)
    setDropTargetIndex(null)
  }, [draggedTabId, tabs, onTabReorder, announce, t])

  const handleTabClose = useCallback((tabId: string) => {
    const closedTab = tabs.find(tab => tab.id === tabId)
    onTabClose(tabId)
    announce(t('tabs.tabClosed', { name: closedTab?.name || 'Tab', count: tabs.length - 1 }))
  }, [tabs, onTabClose, announce, t])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex(tab => tab.id === activeTabId)
    if (currentIndex === -1) return

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        if (currentIndex > 0) {
          onTabClick(tabs[currentIndex - 1].id)
        }
        break
      case 'ArrowRight':
        e.preventDefault()
        if (currentIndex < tabs.length - 1) {
          onTabClick(tabs[currentIndex + 1].id)
        }
        break
      case 'Home':
        e.preventDefault()
        if (tabs.length > 0) {
          onTabClick(tabs[0].id)
        }
        break
      case 'End':
        e.preventDefault()
        if (tabs.length > 0) {
          onTabClick(tabs[tabs.length - 1].id)
        }
        break
    }
  }, [tabs, activeTabId, onTabClick])

  useEffect(() => {
    return registerTabBarDropResolver((screenX) => {
      const element = tabBarRef.current
      if (!element) {
        return tabs.length
      }

      const children = Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]'))
      const clientX = screenX - window.screenX
      const index = children.findIndex(child => { const rect = child.getBoundingClientRect(); return clientX < rect.left + rect.width / 2 })
      return index < 0 ? tabs.length : index
    })
  }, [tabs.length])

  return (
    <div className="flex items-center h-full min-w-0 flex-1">
      {/* Tab list */}
      <div
        ref={tabBarRef}
        onDragOver={event => { if (event.dataTransfer.types.includes(TAB_DRAG_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
        onDrop={event => { if (event.target === event.currentTarget) handleDrop(event, tabs[tabs.length - 1]?.id ?? '') }}
        role="tablist"
        aria-label={t('tabs.openSessions')}
        aria-orientation="horizontal"
        className="flex flex-1 items-center h-full min-w-0 overflow-x-auto scrollbar-hide"
        onMouseDown={event => { if (event.button === 0 && event.target === event.currentTarget) void windowStartDragging().catch(() => undefined) }}
        onDoubleClick={event => { if (event.target === event.currentTarget) void windowToggleMaximize().catch(() => undefined) }}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={cn(
              'relative h-full',
              dropTargetIndex === index && draggedTabId !== tab.id && 'before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-primary before:rounded-full'
            )}
          >
            <Tab
              id={tab.id}
              name={tab.name}
              path={tab.path}
              isActive={tab.id === activeTabId}
              canClose={true}
              onActivate={() => onTabClick(tab.id)}
              onClose={() => handleTabClose(tab.id)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
            />
          </div>
        ))}
      </div>

      {/* New tab button */}
      <button
        type="button"
        aria-label={t('tabs.newSession')}
        onClick={onNewTab}
        className={cn(
          'h-6 w-6 flex items-center justify-center mx-1 rounded-sm flex-shrink-0',
          'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
        )}
      >
        <Icons.plus className="h-3.5 w-3.5" />
      </button>

      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </div>
  )
}
