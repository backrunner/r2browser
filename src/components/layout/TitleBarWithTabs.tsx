import { useEffect, useState, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Icons } from '@/components/ui/icons'
import { TabBar, WindowTab } from './TabBar'
import {
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
  windowStartDragging,
} from '@/lib/window'
import { cn } from '@/lib/utils'
import { TransferTasks } from './TransferTasks'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

interface TitleBarWithTabsProps {
  tabs: WindowTab[]
  activeTabId: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabReorder: (tabId: string, newIndex: number) => void
  onTabDragOut?: (tabId: string, screenX: number, screenY: number) => void
  onNewTab: () => void
  onOpenSettings: () => void
}

export function TitleBarWithTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onTabDragOut,
  onNewTab,
  onOpenSettings,
}: TitleBarWithTabsProps) {
  const { t } = useTranslation()
  const [isMax, setIsMax] = useState(false)
  const [isMacOS, setIsMacOS] = useState(false)

  useEffect(() => {
    // Query initial maximized state
    windowIsMaximized().then(setIsMax).catch(() => setIsMax(false))

    // Detect platform
    const isMac = navigator.userAgent.toLowerCase().includes('mac')
    setIsMacOS(isMac)
  }, [])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    void getCurrentWebviewWindow().onResized(() => {
      void windowIsMaximized().then(value => { if (!disposed) setIsMax(value) }).catch(() => undefined)
    }).then(fn => { if (disposed) fn(); else cleanup = fn }).catch(() => undefined)
    return () => { disposed = true; cleanup?.() }
  }, [])

  const handleToggleMax = async () => {
    const next = await windowToggleMaximize()
    setIsMax(next)
  }

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Only start dragging on left click and if target is the title bar background
    if (e.button === 0 && e.target === e.currentTarget) {
      windowStartDragging().catch(() => {
        // Ignore dragging errors
      })
    }
  }

  const handleDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    // Only toggle maximize if double-clicking the background
    if (e.target === e.currentTarget) {
      handleToggleMax()
    }
  }

  return (
    <div
      className="h-8 w-full flex items-center select-none border-b border-border bg-card/95"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* macOS traffic lights space - 72px to accommodate buttons */}
      {isMacOS && (
        <div
          className="w-18 flex-shrink-0"
          aria-hidden="true"
        />
      )}

      {/* Title - left aligned on macOS, visible only when no tabs or few tabs */}
      <div
        className={cn(
          'flex-shrink-0 px-3 text-xs font-medium text-muted-foreground',
          'whitespace-nowrap',
          // Hide title when tabs take up space, but keep for accessibility
          tabs.length > 0 && 'hidden sm:block'
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {t('common.appName')}
      </div>

      {/* Tab bar - takes remaining space */}
      <div
          className="flex-1 h-full min-w-0 overflow-hidden"
          // Prevent drag when interacting with tabs
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={onTabClick}
            onTabClose={onTabClose}
            onTabReorder={onTabReorder}
            onTabDragOut={onTabDragOut}
            onNewTab={onNewTab}
          />
      </div>

      <button type="button" onClick={onOpenSettings} title={t('common.settings')} aria-label={t('common.settings')} className="no-drag h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60">
        <Icons.settings className="h-4 w-4" />
      </button>
      <TransferTasks />

      {/* Window controls - Windows/Linux only */}
      {!isMacOS && (
        <div className="flex flex-shrink-0">
          <button
            className="h-8 w-12 grid place-items-center hover:bg-muted/60 transition-colors"
            aria-label={t('window.minimize')}
            onClick={() => windowMinimize()}
          >
            <Icons.minus className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-12 grid place-items-center hover:bg-muted/60 transition-colors"
            aria-label={isMax ? t('window.restore') : t('window.maximize')}
            onClick={handleToggleMax}
          >
            {isMax ? (
              <Icons.minimize className="h-4 w-4" />
            ) : (
              <Icons.maximize className="h-4 w-4" />
            )}
          </button>
          <button
            className="h-8 w-12 grid place-items-center hover:bg-red-500/90 hover:text-white transition-colors"
            aria-label={t('window.close')}
            onClick={() => windowClose()}
          >
            <Icons.x className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
