import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { SessionForm } from '@/components/welcome/SessionForm'
import { SessionList } from '@/components/welcome/SessionList'

export function WelcomePage() {
  const navigate = useNavigate()
  const { sessions, loadSessions, setCurrentSession } = useAppStore()
  const [showNewSessionForm, setShowNewSessionForm] = useState(false)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleSessionSelect = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
      navigate(`/manager/${sessionId}`)
    }
  }

  const handleNewSession = () => {
    setShowNewSessionForm(true)
  }

  const handleSessionCreated = (sessionId: string) => {
    setShowNewSessionForm(false)
    handleSessionSelect(sessionId)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-zinc-900 dark:to-zinc-800 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Icons.cloud className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
              R2 Browser
            </h1>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Modern file manager for Cloudflare R2 and S3-compatible storage
          </p>
        </div>

        {!showNewSessionForm ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* New Session Card */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Icons.plus className="h-5 w-5 mr-2" />
                  New Connection
                </CardTitle>
                <CardDescription>
                  Connect to your R2 bucket or S3-compatible storage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleNewSession}
                  className="w-full"
                  size="lg"
                >
                  <Icons.plus className="h-4 w-4 mr-2" />
                  Create New Session
                </Button>
              </CardContent>
            </Card>

            {/* Recent Sessions Card */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Icons.clock className="h-5 w-5 mr-2" />
                  Recent Sessions
                </CardTitle>
                <CardDescription>
                  Quick access to your recent connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessions.length > 0 ? (
                  <SessionList
                    sessions={sessions}
                    onSessionSelect={handleSessionSelect}
                    maxItems={3}
                  />
                ) : (
                  <div className="text-center py-8 text-zinc-500">
                    <Icons.database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sessions yet</p>
                    <p className="text-sm">Create your first connection to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewSessionForm(false)}
                  className="mr-2"
                >
                  <Icons.back className="h-4 w-4" />
                </Button>
                New Connection
              </CardTitle>
              <CardDescription>
                Configure your R2 or S3-compatible storage connection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SessionForm onSessionCreated={handleSessionCreated} />
            </CardContent>
          </Card>
        )}

        {/* All Sessions */}
        {!showNewSessionForm && sessions.length > 3 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>All Sessions</CardTitle>
              <CardDescription>
                Manage all your storage connections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SessionList
                sessions={sessions}
                onSessionSelect={handleSessionSelect}
                showAll={true}
              />
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          <p>
            Supports Cloudflare R2, AWS S3, and any S3-compatible storage service
          </p>
        </div>
      </div>
    </div>
  )
}