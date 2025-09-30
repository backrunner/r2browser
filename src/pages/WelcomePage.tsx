import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { SessionForm } from '@/components/welcome/SessionForm'
import { SessionList } from '@/components/welcome/SessionList'

export function WelcomePage() {
  const navigate = useNavigate()
  const { sessions, setCurrentSession } = useAppStore()
  const [showNewSessionForm, setShowNewSessionForm] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<'r2' | 's3'>('r2')
  const sessionsLoadedRef = useRef(false)

  useEffect(() => {
    // Only load sessions once when component mounts
    if (!sessionsLoadedRef.current) {
      sessionsLoadedRef.current = true
      useAppStore.getState().loadSessions()
    }
  }, [])

  const handleSessionSelect = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
      navigate(`/manager/${sessionId}`)
    }
  }

  // removed; replaced with explicit provider buttons

  const handleSessionCreated = (sessionId: string) => {
    setShowNewSessionForm(false)
    handleSessionSelect(sessionId)
  }

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-zinc-900 dark:to-zinc-800 p-6">
      <div className={`relative w-full ${showNewSessionForm ? 'max-w-xl' : 'max-w-3xl'} mx-auto h-full flex flex-col`}>
        {/* Header (static, no transition) */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            <Icons.cloud className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
              R2 Browser
            </h1>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Modern file manager for Cloudflare R2 and S3-compatible storage
          </p>
        </div>

        {/* Section header (static, no transition) */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {showNewSessionForm ? (
              <Icons.plus className="h-5 w-5 mr-2 text-blue-600" />
            ) : (
              <Icons.clock className="h-5 w-5 mr-2 text-blue-600" />
            )}
            <h2 className="text-base font-semibold">
              {showNewSessionForm ? 'Add New Connection' : 'Recent Sessions'}
            </h2>
          </div>
          {!showNewSessionForm && (
            <Button
              onClick={() => { setSelectedProvider('r2'); setShowNewSessionForm(true); }}
              size="sm"
            >
              <Icons.plus className="h-4 w-4 mr-1" />
              New Connection
            </Button>
          )}
        </div>

        {/* Transitioned content area only (fills remaining height) */}
        <div className="flex-1 min-h-0 relative">
          {/* List layer */}
          <div
            className={`absolute inset-0 transition-opacity duration-150 ease-out will-change-[opacity,transform] transform-gpu ${
              showNewSessionForm ? 'opacity-0 pointer-events-none translate-y-1' : 'opacity-100 translate-y-0'
            }`}
          >
            <Card className="hover:shadow-lg transition-shadow h-full flex flex-col">
              <CardContent className="p-0 flex-1 min-h-0">
                <div className="h-full overflow-auto p-4">
                  {sessions.length > 0 ? (
                    <SessionList
                      sessions={sessions}
                      onSessionSelect={handleSessionSelect}
                      showAll={true}
                    />
                  ) : (
                    <div className="h-full grid place-items-center text-zinc-500">
                      <div className="text-center">
                        <Icons.database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No sessions yet</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Form layer */}
          <div
            className={`absolute inset-0 transition-opacity duration-150 ease-out will-change-[opacity,transform] transform-gpu ${
              showNewSessionForm ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none translate-y-1'
            }`}
          >
            <div className="w-full max-w-xl mx-auto">
              <div className="mb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewSessionForm(false)}
                  className="-ml-2"
                >
                  <Icons.back className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
              <div className="w-full border rounded-lg bg-card p-6 shadow-sm">
                <SessionForm onSessionCreated={handleSessionCreated} initialData={{ type: selectedProvider }} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer (static, preserved) */}
        <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>Supports Cloudflare R2, AWS S3, and any S3-compatible storage service</p>
        </div>
      </div>
    </div>
  )
}
