import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Session } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface TabSession extends Session {
  tabId: string
}

interface MultiTabManagerProps {
  children: (activeSession: Session | null) => React.ReactNode
}

export function MultiTabManager({ children }: MultiTabManagerProps) {
  const [tabs, setTabs] = useState<TabSession[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)


  const closeTab = (tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.tabId !== tabId)

      // If closing active tab, switch to another tab
      if (activeTab === tabId) {
        const remainingTabs = newTabs
        if (remainingTabs.length > 0) {
          setActiveTab(remainingTabs[remainingTabs.length - 1].tabId)
        } else {
          setActiveTab(null)
        }
      }

      return newTabs
    })
  }


  if (tabs.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Icons.folderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">No sessions open</h2>
          <p className="text-muted-foreground mb-4">
            Open a session to start managing your files
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab || ''} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="h-auto p-1 bg-muted/30 rounded-none border-b">
          {tabs.map((tab) => (
            <div key={tab.tabId} className="flex items-center group">
              <TabsTrigger
                value={tab.tabId}
                className="flex items-center space-x-2 data-[state=active]:bg-background"
              >
                <Icons.database className="h-4 w-4" />
                <span className="max-w-32 truncate">{tab.name}</span>
              </TabsTrigger>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.tabId)
                }}
                className="h-6 w-6 p-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Icons.x className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent
            key={tab.tabId}
            value={tab.tabId}
            className="flex-1 m-0 overflow-hidden"
          >
            {children(tab)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
