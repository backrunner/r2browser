import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { WelcomePage } from './pages/WelcomePage'
import { FileManagerPage } from './pages/FileManagerPage'
import { Toaster } from './components/ui/toaster'
import { TitleBarWithTabs } from './components/layout/TitleBarWithTabs'
import { UpdateDialog } from './components/dialogs/UpdateDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUpdater } from './hooks/use-updater'
import { useTabManager } from './hooks/use-tab-manager'
import { useWindowSync } from './hooks/use-window-sync'
import { useAppStore } from './stores/app-store'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const initStartedRef = useRef(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const { status, checkForUpdates, updateAndRestart } = useUpdater()
  const { initializeApp, isInitialized, setCurrentSession, navigateToPath } = useAppStore()
  const {
    windowTabs,
    activeTabId,
    switchTab,
    closeTab,
    reorderTab,
    tabs,
  } = useTabManager()
  const { handleTabDragOut } = useWindowSync()

  useEffect(() => {
    if (initStartedRef.current || isInitialized) {
      return
    }

    initStartedRef.current = true
    void initializeApp()
  }, [initializeApp, isInitialized])

  useEffect(() => {
    if (status.available && !status.readyToInstall) {
      setUpdateDialogOpen(true)
    }
  }, [status.available, status.readyToInstall])

  const handleUpdate = async () => {
    if (status.readyToInstall) {
      await updateAndRestart()
    } else if (status.available) {
      await updateAndRestart()
    }
  }

  const handleTabClick = useCallback((tabId: string) => {
    switchTab(tabId)
    const tab = tabs.find(t => t.tabId === tabId)
    if (tab) {
      setCurrentSession(tab.session)
      void navigateToPath(tab.path)
      navigate(`/manager/${tab.session.id}`)
    }
  }, [navigate, navigateToPath, setCurrentSession, switchTab, tabs])

  const handleTabClose = useCallback((tabId: string) => {
    const closingIndex = tabs.findIndex((tab) => tab.tabId === tabId)
    const nextTabs = tabs.filter((tab) => tab.tabId !== tabId)
    const closedWasActive = activeTabId === tabId

    closeTab(tabId)

    if (nextTabs.length === 0) {
      setCurrentSession(null)
      navigate('/')
      return
    }

    if (closedWasActive) {
      const nextIndex = Math.min(closingIndex, nextTabs.length - 1)
      const nextTab = nextTabs[nextIndex]
      if (nextTab) {
        setCurrentSession(nextTab.session)
        void navigateToPath(nextTab.path)
        navigate(`/manager/${nextTab.session.id}`)
      }
    }
  }, [activeTabId, closeTab, navigate, navigateToPath, setCurrentSession, tabs])

  const handleNewTab = useCallback(() => {
    setCurrentSession(null)
    navigate('/')
  }, [navigate, setCurrentSession])

  useEffect(() => {
    const match = location.pathname.match(/^\/manager\/(.+)$/)
    if (match) {
      const sessionId = match[1]
      const matchingTab = tabs.find(t => t.session.id === sessionId)
      if (matchingTab && matchingTab.tabId !== activeTabId) {
        switchTab(matchingTab.tabId)
      }
    }
  }, [location.pathname, tabs, activeTabId, switchTab])

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* TitleBar with tabs - always rendered outside ErrorBoundary */}
      <TitleBarWithTabs
        tabs={windowTabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onTabReorder={reorderTab}
        onTabDragOut={handleTabDragOut}
        onNewTab={handleNewTab}
      />

      {/* Wrap the rest of the app in ErrorBoundary */}
      <ErrorBoundary>
        {/* Outer scroll container so only app content scrolls */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="h-full flex flex-col">
            {/* Route outlet fills remaining height */}
            <div className="flex-1 min-h-0">
              <Routes>
                <Route path="/" element={<WelcomePage />} />
                <Route path="/manager/:sessionId" element={<FileManagerPage />} />
              </Routes>
            </div>
          </div>
        </div>
        <Toaster />

        {/* Update Dialog */}
        <UpdateDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          status={status}
          onUpdate={handleUpdate}
          onCheckForUpdates={() => checkForUpdates(false)}
        />
      </ErrorBoundary>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
