import { create } from 'zustand'
import { SessionData } from '@/types'
import { normalizePath } from '@/lib/file'

export interface TabSession {
  tabId: string
  session: SessionData
  path: string
  isActive: boolean
}

interface TabState {
  tabs: TabSession[]
  activeTabId: string | null
}

interface TabActions {
  openSession: (session: SessionData) => string
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  updateTabPath: (tabId: string, path: string) => void
  reorderTab: (tabId: string, newIndex: number) => void
  getActiveSession: () => SessionData | null
  getActiveTab: () => TabSession | null
  hasTab: (sessionId: string) => boolean
  findTabBySession: (sessionId: string) => TabSession | undefined
  removeTabById: (tabId: string) => TabSession | null
  insertTab: (tab: TabSession, index?: number) => void
}

export const useTabStore = create<TabState & TabActions>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  openSession: (session: SessionData) => {
    const { tabs, findTabBySession } = get()

    // Check if session is already open
    const existingTab = findTabBySession(session.id)
    if (existingTab) {
      // Switch to existing tab
      set({
        tabs: tabs.map(t => ({
          ...t,
          isActive: t.tabId === existingTab.tabId,
        })),
        activeTabId: existingTab.tabId,
      })
      return existingTab.tabId
    }

    // Create new tab
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const newTab: TabSession = {
      tabId,
      session,
      path: '',
      isActive: true,
    }

    set({
      tabs: [
        ...tabs.map(t => ({ ...t, isActive: false })),
        newTab,
      ],
      activeTabId: tabId,
    })

    return tabId
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get()
    const closingIndex = tabs.findIndex(t => t.tabId === tabId)
    const newTabs = tabs.filter(t => t.tabId !== tabId)

    if (newTabs.length === 0) {
      set({ tabs: [], activeTabId: null })
      return
    }

    // If closing active tab, switch to adjacent tab
    let newActiveId = activeTabId
    if (activeTabId === tabId) {
      // Prefer the tab to the right, otherwise the one to the left
      const newIndex = Math.min(closingIndex, newTabs.length - 1)
      newActiveId = newTabs[newIndex].tabId
    }

    set({
      tabs: newTabs.map(t => ({
        ...t,
        isActive: t.tabId === newActiveId,
      })),
      activeTabId: newActiveId,
    })
  },

  switchTab: (tabId: string) => {
    const { tabs } = get()
    const targetTab = tabs.find(t => t.tabId === tabId)
    if (!targetTab) return

    set({
      tabs: tabs.map(t => ({
        ...t,
        isActive: t.tabId === tabId,
      })),
      activeTabId: tabId,
    })
  },

  updateTabPath: (tabId: string, path: string) => {
    const normalizedPath = normalizePath(path)
    set((state) => {
      let changed = false
      const tabs = state.tabs.map((tab) => {
        if (tab.tabId === tabId && tab.path !== normalizedPath) {
          changed = true
          return { ...tab, path: normalizedPath }
        }

        return tab
      })

      return changed ? { tabs } : state
    })
  },

  getActiveSession: () => {
    const { tabs, activeTabId } = get()
    const activeTab = tabs.find(t => t.tabId === activeTabId)
    return activeTab?.session || null
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.tabId === activeTabId) || null
  },

  hasTab: (sessionId: string) => {
    const { tabs } = get()
    return tabs.some(t => t.session.id === sessionId)
  },

  findTabBySession: (sessionId: string) => {
    const { tabs } = get()
    return tabs.find(t => t.session.id === sessionId)
  },

  reorderTab: (tabId: string, newIndex: number) => {
    const { tabs } = get()
    const currentIndex = tabs.findIndex(t => t.tabId === tabId)
    if (currentIndex === -1 || currentIndex === newIndex) return

    const newTabs = [...tabs]
    const [movedTab] = newTabs.splice(currentIndex, 1)
    newTabs.splice(newIndex, 0, movedTab)

    set({ tabs: newTabs })
  },

  removeTabById: (tabId: string) => {
    const { tabs, activeTabId } = get()
    const removedTab = tabs.find(t => t.tabId === tabId)
    if (!removedTab) return null

    const newTabs = tabs.filter(t => t.tabId !== tabId)

    // Determine new active tab if we're removing the active one
    let newActiveId = activeTabId
    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const removedIndex = tabs.findIndex(t => t.tabId === tabId)
        const newIndex = Math.min(removedIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].tabId
      } else {
        newActiveId = null
      }
    }

    set({
      tabs: newTabs.map(t => ({
        ...t,
        isActive: t.tabId === newActiveId,
      })),
      activeTabId: newActiveId,
    })

    return removedTab
  },

  insertTab: (tab: TabSession, index?: number) => {
    const { tabs, findTabBySession } = get()
    const normalizedTab = { ...tab, path: normalizePath(tab.path) }

    // Check if session is already open
    const existingTab = findTabBySession(normalizedTab.session.id)
    if (existingTab) {
      // Switch to existing tab instead and preserve the most recent path state.
      set({
        tabs: tabs.map(t => ({
          ...(t.tabId === existingTab.tabId && t.path !== normalizedTab.path ? { ...t, path: normalizedTab.path } : t),
          isActive: t.tabId === existingTab.tabId,
        })),
        activeTabId: existingTab.tabId,
      })
      return
    }

    const newTabs = [...tabs.map(t => ({ ...t, isActive: false }))]
    const insertIndex = index !== undefined ? Math.min(index, newTabs.length) : newTabs.length
    newTabs.splice(insertIndex, 0, { ...normalizedTab, isActive: true })

    set({
      tabs: newTabs,
      activeTabId: normalizedTab.tabId,
    })
  },
}))
