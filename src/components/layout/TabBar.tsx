import { useRef, useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab } from './Tab'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { calculateDropIndex, registerTabBarDropResolver } from './tab-bar-drop'

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
    setDraggedTabId(tabId)
    // Add a drag image
    const target = e.currentTarget as HTMLElement
    if (target) {
      e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2)
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent, tabId: string) => {
    // Check if drag ended outside the tab bar (for drag-out to new window)
    if (onTabDragOut) {
      const tabBarRect = tabBarRef.current?.getBoundingClientRect()
      if (tabBarRect) {
        const isOutsideTabBar =
          e.clientX < tabBarRect.left ||
          e.clientX > tabBarRect.right ||
          e.clientY < tabBarRect.top - 50 || // Allow some tolerance above
          e.clientY > tabBarRect.bottom + 50 // Allow some tolerance below

        if (isOutsideTabBar) {
          onTabDragOut(tabId, e.screenX, e.screenY)
        }
      }
    }

    setDraggedTabId(null)
    setDropTargetIndex(null)
  }, [onTabDragOut])

  const handleDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedTabId) {
      setDropTargetIndex(targetIndex)
    }
  }, [draggedTabId])

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (!draggedTabId || draggedTabId === targetTabId) {
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

      const rect = element.getBoundingClientRect()
      return calculateDropIndex(screenX, {
        left: window.screenX + rect.left,
        width: rect.width,
        tabCount: tabs.length,
      })
    })
  }, [tabs.length])

  return (
    <div className="flex items-center h-full min-w-0 flex-1">
      {/* Tab list */}
      <div
        ref={tabBarRef}
        role="tablist"
        aria-label={t('tabs.openSessions')}
        aria-orientation="horizontal"
        className="flex items-center h-full min-w-0 overflow-x-auto scrollbar-hide"
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
              canClose={tabs.length > 1}
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
