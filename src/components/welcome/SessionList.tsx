import React from 'react'
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
  const { removeSession } = useAppStore()
  const displaySessions = maxItems && !showAll ? sessions.slice(0, maxItems) : sessions

  const deleteSessionById = async (sessionId: string) => {
    if (onSessionDelete) {
      onSessionDelete(sessionId)
    } else if (confirm('Are you sure you want to delete this session?')) {
      await removeSession(sessionId)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
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
        return 'Cloudflare R2'
      case 's3':
        return 'S3 Compatible'
      default:
        return type
    }
  }

  if (displaySessions.length === 0) {
    return (
      <div className="text-center py-4 text-zinc-500 select-none">
        No sessions available
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {getProviderIcon(session.config.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">
                        {session.name}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span className="flex items-center">
                          {getProviderLabel(session.config.type)}
                        </span>
                        <span className="flex items-center">
                          <Icons.database className="h-3 w-3 mr-1" />
                          {session.config.bucket_name}
                        </span>
                        <span className="flex items-center">
                          <Icons.clock className="h-3 w-3 mr-1" />
                          {format(new Date(session.last_accessed), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Icons.delete className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => onSessionSelect(session.id)}>
              <Icons.folder className="h-4 w-4 mr-2" />
              <span>Open</span>
            </ContextMenuItem>
            {onSessionOpenInWindow && (
              <ContextMenuItem onClick={() => onSessionOpenInWindow(session)}>
                <Icons.window className="h-4 w-4 mr-2" />
                <span>Open in New Window</span>
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            {onSessionEdit && (
              <ContextMenuItem onClick={() => onSessionEdit(session)}>
                <Icons.edit className="h-4 w-4 mr-2" />
                <span>Edit</span>
              </ContextMenuItem>
            )}
            <ContextMenuItem
              onClick={() => deleteSessionById(session.id)}
              className="text-destructive focus:text-destructive"
            >
              <Icons.delete className="h-4 w-4 mr-2" />
              <span>Delete</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  )
}
