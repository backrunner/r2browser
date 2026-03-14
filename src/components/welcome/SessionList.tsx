import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  onSessionDelete?: (sessionId: string) => void
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
      onSessionDelete(sessionId)
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
    <div className="space-y-3">
      {displaySessions.map((session) => (
        <ContextMenu key={session.id}>
          <ContextMenuTrigger asChild>
            <Card
              className="cursor-pointer hover:shadow-lg transition-all duration-200 border-border shadow-sm hover:border-primary/50 select-none"
              onClick={() => onSessionSelect(session.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {getProviderIcon(session.config.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">
                      {session.name}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex-shrink-0">
                        {getProviderLabel(session.config.type)}
                      </span>
                      <span className="flex items-center flex-shrink-0">
                        <Icons.clock className="h-3 w-3 mr-1" />
                        {format(new Date(session.last_accessed), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="h-8 w-8 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Icons.delete className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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
