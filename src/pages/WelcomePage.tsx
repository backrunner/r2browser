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
    <div className="h-full w-full flex flex-col bg-background p-8 relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Clean gradient background - light mode: very subtle, dark mode: atmospheric */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-transparent to-zinc-100 dark:from-zinc-950 dark:via-transparent dark:to-zinc-900" />

        {/* Floating orbs - softer in light mode */}
        <div className="absolute top-0 -left-4 w-96 h-96 bg-zinc-400/5 dark:bg-zinc-500/10 rounded-full filter blur-3xl animate-blob" />
        <div className="absolute top-0 -right-4 w-96 h-96 bg-zinc-500/5 dark:bg-zinc-400/10 rounded-full filter blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-zinc-300/5 dark:bg-zinc-600/10 rounded-full filter blur-3xl animate-blob animation-delay-4000" />

        {/* Grid pattern - much lighter in light mode */}
        <div className="absolute inset-0 opacity-30 dark:opacity-100 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      <div className={`relative w-full ${showNewSessionForm ? 'max-w-2xl' : 'max-w-5xl'} mx-auto h-full flex flex-col transition-all duration-300`}>
        {/* Section header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-lg">
              {showNewSessionForm ? (
                <Icons.plus className="h-5 w-5 text-primary-foreground" />
              ) : (
                <Icons.clock className="h-5 w-5 text-primary-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {showNewSessionForm ? 'Add New Connection' : 'Recent Sessions'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {showNewSessionForm ? 'Configure your storage credentials' : 'Quick access to your saved connections'}
              </p>
            </div>
          </div>
          {!showNewSessionForm && (
            <Button
              onClick={() => { setSelectedProvider('r2'); setShowNewSessionForm(true); }}
              className="shadow-md hover:shadow-lg transition-all duration-200"
            >
              <Icons.plus className="h-4 w-4 mr-2" />
              New Connection
            </Button>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 relative">
          {/* List layer */}
          <div
            className={`absolute inset-0 transition-opacity duration-200 ease-out ${
              showNewSessionForm ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <Card className="h-full flex flex-col border-border shadow-xl transition-shadow duration-300">
              <CardContent className="p-0 flex-1 min-h-0">
                <div className="h-full overflow-auto p-6">
                  {sessions.length > 0 ? (
                    <SessionList
                      sessions={sessions}
                      onSessionSelect={handleSessionSelect}
                      showAll={true}
                    />
                  ) : (
                    <div className="h-full grid place-items-center text-muted-foreground">
                      <div className="text-center max-w-md">
                        <div className="relative inline-block mb-6">
                          <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl" />
                          <div className="relative bg-muted/50 dark:bg-muted/30 p-8 rounded-full">
                            <Icons.database className="h-20 w-20 opacity-40" />
                          </div>
                        </div>
                        <h3 className="text-xl font-semibold mb-3 text-foreground">No connections yet</h3>
                        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                          Get started by adding your first connection to Cloudflare R2 or any S3-compatible storage service
                        </p>
                        <Button
                          onClick={() => { setSelectedProvider('r2'); setShowNewSessionForm(true); }}
                          size="lg"
                          className="shadow-md"
                        >
                          <Icons.plus className="h-4 w-4 mr-2" />
                          Add Connection
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Form layer */}
          <div
            className={`absolute inset-0 transition-opacity duration-200 ease-out ${
              showNewSessionForm ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="w-full h-full flex flex-col">
              <div className="mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewSessionForm(false)}
                  className="hover:bg-accent"
                >
                  <Icons.back className="h-4 w-4 mr-2" />
                  Back to Sessions
                </Button>
              </div>
              <Card className="flex-1 min-h-0 border-border shadow-xl overflow-hidden">
                <CardContent className="p-8 h-full overflow-auto">
                  <SessionForm onSessionCreated={handleSessionCreated} initialData={{ type: selectedProvider }} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-4 px-5 py-2.5 rounded-full bg-muted/50 dark:bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground">Secure Connection</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <span className="text-xs text-muted-foreground">
              Cloudflare R2 · S3 Compatible Services
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
