import { useTabStore, TabSession } from '@/stores/tab-store'
import { SessionData } from '@/types'
import { WindowTab } from '@/components/layout/TabBar'

// Hook to provide tab management functionality
export function useTabManager() {
  const {
    tabs,
    activeTabId,
    openSession,
    closeTab,
    switchTab,
    updateTabPath,
    reorderTab,
    getActiveSession,
    getActiveTab,
    hasTab,
    findTabBySession,
    removeTabById,
    insertTab,
  } = useTabStore()

  // Convert internal tab format to WindowTab format for title bar
  const windowTabs: WindowTab[] = tabs.map(tab => ({
    id: tab.tabId,
    sessionId: tab.session.id,
    name: tab.session.name || tab.session.config.bucket_name || 'Session',
    path: tab.path,
  }))

  return {
    // State
    tabs,
    activeTabId,
    windowTabs,

    // Actions
    openSession: (session: SessionData): string => {
      return openSession(session)
    },

    closeTab: (tabId: string): void => {
      closeTab(tabId)
    },

    switchTab: (tabId: string): void => {
      switchTab(tabId)
    },

    updateTabPath: (tabId: string, path: string): void => {
      updateTabPath(tabId, path)
    },

    reorderTab: (tabId: string, newIndex: number): void => {
      reorderTab(tabId, newIndex)
    },

    // For drag-out to new window
    removeTabById: (tabId: string): TabSession | null => {
      return removeTabById(tabId)
    },

    // For window merge
    insertTab: (tab: TabSession, index?: number): void => {
      insertTab(tab, index)
    },

    // Getters
    getActiveSession: (): SessionData | null => {
      return getActiveSession()
    },

    getActiveTab: (): TabSession | null => {
      return getActiveTab()
    },

    hasTab: (sessionId: string): boolean => {
      return hasTab(sessionId)
    },

    findTabBySession: (sessionId: string): TabSession | undefined => {
      return findTabBySession(sessionId)
    },

    // Computed
    tabCount: tabs.length,
    hasOpenTabs: tabs.length > 0,
  }
}
