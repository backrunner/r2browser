import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { WelcomePage } from './pages/WelcomePage'
import { FileManagerPage } from './pages/FileManagerPage'
import { Toaster } from './components/ui/toaster'
import { TitleBar } from './components/layout/TitleBar'

function App() {
  return (
    <Router>
      <div className="h-screen w-screen bg-background text-foreground flex flex-col overflow-hidden">
        {/* Outer scroll container so only app content scrolls */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="h-full flex flex-col">
            <TitleBar />
            {/* Route outlet fills remaining height below TitleBar */}
            <div className="flex-1 min-h-0">
              <Routes>
                <Route path="/" element={<WelcomePage />} />
                <Route path="/manager/:sessionId" element={<FileManagerPage />} />
              </Routes>
            </div>
          </div>
        </div>
        <Toaster />
      </div>
    </Router>
  )
}

export default App
