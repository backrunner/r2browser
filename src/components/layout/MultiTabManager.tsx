import React from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { SessionData } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTabManager } from '@/hooks/use-tab-manager'
import { cn } from '@/lib/utils'

interface MultiTabManagerProps {
  children: (activeSession: SessionData | null, currentPath: string, updatePath: (path: string) => void) => React.ReactNode
  onNoTabs?: () => void
}

export function MultiTabManager({ children, onNoTabs }: MultiTabManagerProps) {
  const {
    tabs,
    activeTabId,
    closeTab,
    switchTab,
    updateTabPath,
  } = useTabManager()

  // Handle path updates for the active tab
  const handlePathUpdate = (path: string) => {
    if (activeTabId) {
      updateTabPath(activeTabId, path)
    }
  }

  // Show empty state if no tabs
  if (tabs.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Icons.folderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">No sessions open</h2>
          <p className="text-muted-foreground mb-4">
            Open a session to start managing your files
          </p>
          {onNoTabs && (
            <Button onClick={onNoTabs}>
              <Icons.plus className="h-4 w-4 mr-2" />
              Open Session
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs
        value={activeTabId || ''}
        onValueChange={switchTab}
        className="h-full flex flex-col"
      >
        <TabsList className="h-auto p-0 bg-muted/30 rounded-none border-b justify-start">
          {tabs.map((tab) => (
            <div
              key={tab.tabId}
              className={cn(
                'flex items-center group border-r border-border',
                tab.isActive && 'bg-background'
              )}
            >
              <TabsTrigger
                value={tab.tabId}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-none border-b-2 border-transparent',
                  'data-[state=active]:border-primary data-[state=active]:bg-background',
                  'data-[state=active]:shadow-none'
                )}
              >
                <Icons.database className="h-4 w-4 flex-shrink-0" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="max-w-32 truncate text-sm font-medium">
                    {tab.session.name}
                  </span>
                  {tab.path && (
                    <span className="max-w-32 truncate text-xs text-muted-foreground">
                      /{tab.path}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.tabId)
                }}
                className={cn(
                  'h-6 w-6 p-0 mr-1 rounded-sm',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'hover:bg-destructive/10 hover:text-destructive'
                )}
                title="Close tab"
              >
                <Icons.x className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {/* New tab button placeholder - integration point */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 ml-1"
            onClick={onNoTabs}
            title="Open new session"
          >
            <Icons.plus className="h-4 w-4" />
          </Button>
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent
            key={tab.tabId}
            value={tab.tabId}
            className="flex-1 m-0 overflow-hidden data-[state=inactive]:hidden"
          >
            {children(tab.session, tab.path, handlePathUpdate)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// Export a simpler hook for components that just need to open tabs
export function useOpenInTab() {
  const { openSession, hasTab, findTabBySession, switchTab } = useTabManager()

  return {
    openInTab: (session: SessionData) => {
      // If already open, just switch to it
      const existingTab = findTabBySession(session.id)
      if (existingTab) {
        switchTab(existingTab.tabId)
        return existingTab.tabId
      }
      // Otherwise open new tab
      return openSession(session)
    },
    isSessionOpen: hasTab,
  }
}
