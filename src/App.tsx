import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { WelcomePage } from './pages/WelcomePage'
import { FileManagerPage } from './pages/FileManagerPage'
import { Toaster } from './components/ui/toaster'

function App() {
  return (
    <Router>
      <div className="h-screen w-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/manager/:sessionId" element={<FileManagerPage />} />
        </Routes>
        <Toaster />
      </div>
    </Router>
  )
}

export default App