import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './providers/ThemeProvider.tsx'
import './styles/globals.css'
import 'virtual:uno.css'

// Disable default browser context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  return false
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="r2browser-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)