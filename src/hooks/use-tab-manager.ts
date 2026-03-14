import { useTabStore } from '@/stores/tab-store'
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
    openSession,
    closeTab,
    switchTab,
    updateTabPath,
    reorderTab,
    removeTabById,
    insertTab,
    getActiveSession,
    getActiveTab,
    hasTab,
    findTabBySession,

    // Computed
    tabCount: tabs.length,
    hasOpenTabs: tabs.length > 0,
  }
}
