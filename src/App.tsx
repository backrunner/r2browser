import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { WelcomePage } from './pages/WelcomePage'
import { FileManagerPage } from './pages/FileManagerPage'
import { Toaster } from './components/ui/toaster'
import { TitleBar } from './components/layout/TitleBar'
import { UpdateDialog } from './components/dialogs/UpdateDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUpdater } from './hooks/use-updater'

function App() {
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const { status, checkForUpdates, updateAndRestart } = useUpdater()

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

  return (
    <Router>
      <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
        {/* TitleBar is always rendered outside ErrorBoundary to ensure window controls work */}
        <TitleBar />

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
    </Router>
  )
}

export default App
