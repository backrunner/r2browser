import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { WelcomePage } from './pages/WelcomePage'
import { FileManagerPage } from './pages/FileManagerPage'
import { Toaster } from './components/ui/toaster'
import { TitleBarWithTabs } from './components/layout/TitleBarWithTabs'
import { UpdateDialog } from './components/dialogs/UpdateDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUpdater } from './hooks/use-updater'
import { useTabManager } from './hooks/use-tab-manager'
import { useWindowSync } from './hooks/use-window-sync'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const { status, checkForUpdates, updateAndRestart } = useUpdater()
  const {
    windowTabs,
    activeTabId,
    switchTab,
    closeTab,
    reorderTab,
    tabs,
  } = useTabManager()
  const { handleTabDragOut } = useWindowSync()

  // Show update dialog when an update is available
  useEffect(() => {
    if (status.available && !status.readyToInstall) {
      setUpdateDialogOpen(true)
    }
  }, [status.available, status.readyToInstall])

  // Handle update button click
  const handleUpdate = async () => {
    if (status.readyToInstall) {
      await updateAndRestart()
    } else if (status.available) {
      await updateAndRestart()
    }
  }

  // Handle tab click - navigate to the session
  const handleTabClick = useCallback((tabId: string) => {
    switchTab(tabId)
    const tab = tabs.find(t => t.tabId === tabId)
    if (tab) {
      navigate(`/manager/${tab.session.id}`)
    }
  }, [switchTab, tabs, navigate])

  // Handle tab close
  const handleTabClose = useCallback((tabId: string) => {
    closeTab(tabId)
    // If we closed the active tab and there are remaining tabs, stay on the new active
    // If no tabs remain, go to welcome page
    const remainingTabs = tabs.filter(t => t.tabId !== tabId)
    if (remainingTabs.length === 0) {
      navigate('/')
    }
  }, [closeTab, tabs, navigate])

  // Handle new tab - go to welcome page
  const handleNewTab = useCallback(() => {
    navigate('/')
  }, [navigate])

  // Sync URL with active tab
  useEffect(() => {
    // When on a manager page, ensure the right tab is active
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
