import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { SessionData } from '@/types'
import { useAppStore } from '@/stores/app-store'
import { format } from 'date-fns'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface SessionListProps {
  sessions: SessionData[]
  onSessionSelect: (sessionId: string) => void
  onSessionEdit?: (session: SessionData) => void
  onSessionDelete?: (sessionId: string) => void | Promise<void>
  onSessionOpenInWindow?: (session: SessionData) => void
  maxItems?: number
  showAll?: boolean
}

export function SessionList({
  sessions,
  onSessionSelect,
  onSessionEdit,
  onSessionDelete,
  onSessionOpenInWindow,
  maxItems,
  showAll = false
}: SessionListProps) {
  const { t } = useTranslation()
  const { removeSession } = useAppStore()
  const displaySessions = maxItems && !showAll ? sessions.slice(0, maxItems) : sessions

  const deleteSessionById = async (sessionId: string) => {
    if (onSessionDelete) {
      await onSessionDelete(sessionId)
    } else if (confirm(t('welcome.deleteSessionConfirm'))) {
      await removeSession(sessionId)
    }
  }

  const handleDeleteSession = async (e: MouseEvent, sessionId: string) => {
    e.stopPropagation()
    await deleteSessionById(sessionId)
  }

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'r2':
        return <Icons.cloud className="h-4 w-4" />
      case 's3':
        return <Icons.database className="h-4 w-4" />
      default:
        return <Icons.server className="h-4 w-4" />
    }
  }

  const getProviderLabel = (type: string) => {
    switch (type) {
      case 'r2':
        return t('session.cloudflareR2')
      case 's3':
        return t('session.s3Compatible')
      default:
        return type
    }
  }

  if (displaySessions.length === 0) {
    return (
      <div className="text-center py-4 text-zinc-500 select-none">
        {t('session.noSessions')}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/60">
      {displaySessions.map((session) => (
        <ContextMenu key={session.id}>
          <ContextMenuTrigger asChild>
            <div className="group flex items-center gap-1 rounded-md hover:bg-accent transition-colors select-none">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSessionSelect(session.id)}
              >
                <span className="shrink-0 text-muted-foreground">{getProviderIcon(session.config.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{session.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{getProviderLabel(session.config.type)}</span>
                    <span>{format(new Date(session.last_accessed), 'MMM d, yyyy')}</span>
                  </span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                title={t('common.delete')}
                aria-label={`${t('common.delete')} ${session.name}`}
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="mr-1 h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
              >
                <Icons.delete className="h-4 w-4" />
              </Button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => onSessionSelect(session.id)}>
              <Icons.folder className="h-4 w-4 mr-2" />
              <span>{t('contextMenu.open')}</span>
            </ContextMenuItem>
            {onSessionOpenInWindow && (
              <ContextMenuItem onClick={() => onSessionOpenInWindow(session)}>
                <Icons.window className="h-4 w-4 mr-2" />
                <span>{t('session.openInNewWindow')}</span>
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            {onSessionEdit && (
              <ContextMenuItem onClick={() => onSessionEdit(session)}>
                <Icons.edit className="h-4 w-4 mr-2" />
                <span>{t('common.edit')}</span>
              </ContextMenuItem>
            )}
            <ContextMenuItem
              onClick={() => deleteSessionById(session.id)}
              variant="destructive"
            >
              <Icons.delete className="h-4 w-4 mr-2" />
              <span>{t('common.delete')}</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  )
}
