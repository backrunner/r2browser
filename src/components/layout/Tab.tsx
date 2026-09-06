import { MouseEvent, KeyboardEvent, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

export interface TabProps {
  id: string
  name: string
  path?: string
  isActive: boolean
  canClose: boolean
  onActivate: () => void
  onClose: () => void
  onDragStart?: (e: React.DragEvent, tabId: string) => void
  onDragEnd?: (e: React.DragEvent, tabId: string) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, tabId: string) => void
}

export function Tab({
  id,
  name,
  path,
  isActive,
  canClose,
  onActivate,
  onClose,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: TabProps) {
  const { t } = useTranslation()
  const tabRef = useRef<HTMLDivElement>(null)

  const handleCloseClick = (e: MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Delete' && canClose) {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate()
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
      onDragStart(e, id)
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    if (onDragEnd) {
      onDragEnd(e, id)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (onDragOver) {
      onDragOver(e)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (onDrop) {
      onDrop(e, id)
    }
  }

  return (
    <div
      ref={tabRef}
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${id}`}
      tabIndex={isActive ? 0 : -1}
      aria-label={`${t('tabs.sessionAt', { name, path: path || '' })}${canClose ? ` ${t('tabs.pressDeleteToClose')}` : ''}`}
      draggable
      className={cn(
        'group relative flex items-center gap-1.5 px-3 h-full min-w-0',
        'border-r border-border/50',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
      )}

      {/* Icon */}
      <Icons.database className="h-3.5 w-3.5 flex-shrink-0" />

      {/* Tab content */}
      <div className="flex flex-col items-start min-w-0 max-w-28">
        <span className="truncate text-xs font-medium leading-tight">
          {name}
        </span>
        {path && (
          <span className="truncate text-[10px] text-muted-foreground leading-tight">
            /{path}
          </span>
        )}
      </div>

      {/* Close button */}
      {canClose && (
        <button
          type="button"
          aria-label={t('tabs.closeTab', { name })}
          onClick={handleCloseClick}
          className={cn(
            'ml-1 p-0.5 rounded-sm flex-shrink-0',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'hover:bg-destructive/20 hover:text-destructive',
            'focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
            isActive && 'opacity-60'
          )}
        >
          <Icons.x className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
