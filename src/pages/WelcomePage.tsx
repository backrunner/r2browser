import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { SessionForm } from '@/components/welcome/SessionForm'
import { SessionList } from '@/components/welcome/SessionList'
import { ProfileForm } from '@/components/welcome/ProfileForm'
import { BucketList } from '@/components/welcome/BucketList'
import { ProfileSelector } from '@/components/welcome/ProfileSelector'
import { CorsManagementDialog } from '@/components/dialogs/CorsManagementDialog'
import { SessionData, BucketInfo, CloudflareProfile } from '@/types'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { toast } from '@/hooks/use-toast'
import { info, logError } from '@/lib/logger'
import { useTabManager } from '@/hooks/use-tab-manager'

type ViewMode = 'main' | 'new-session' | 'edit-session' | 'manage-profile'

export function WelcomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { openSession: openTab } = useTabManager()
  const {
    sessions,
    setCurrentSession,
    removeSession,
    profiles,
    currentProfile,
    profileBuckets,
    loadProfiles,
    setCurrentProfile,
    createSession,
    deleteBucket,
    checkBucketEmpty,
  } = useAppStore()

  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [selectedProvider, setSelectedProvider] = useState<'r2' | 's3'>('r2')
  const [editingSession, setEditingSession] = useState<SessionData | null>(null)
  const [editingProfile, setEditingProfile] = useState<CloudflareProfile | null>(null)
  const [corsManagementBucket, setCorsManagementBucket] = useState<BucketInfo | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      useAppStore.getState().loadSessions()
      loadProfiles().then(() => {
        const profiles = useAppStore.getState().profiles
        if (profiles.length > 0 && !currentProfile) {
          setCurrentProfile(profiles[0])
        }
      })
    }
  }, [])

  const handleSessionSelect = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
      // Open session as a tab
      openTab(session)
      navigate(`/manager/${sessionId}`)
    }
  }

  const handleSessionCreated = (sessionId: string) => {
    setViewMode('main')
    setEditingSession(null)
    handleSessionSelect(sessionId)
  }

  const handleSessionEdit = (session: SessionData) => {
    setEditingSession(session)
    setSelectedProvider(session.config.type)
    setViewMode('edit-session')
  }

  const handleSessionDelete = async (sessionId: string) => {
    if (confirm(t('welcome.deleteSessionConfirm'))) {
      await removeSession(sessionId)
    }
  }

  const handleSessionOpenInWindow = async (session: SessionData) => {
    try {
      const windowLabel = `session-${session.id}-${Date.now()}`
      const bucketName = session.config.bucket_name

      const webview = new WebviewWindow(windowLabel, {
        url: `/manager/${session.id}`,
        title: `${bucketName} - R2 Browser`,
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        decorations: false,
        titleBarStyle: 'overlay',
        hiddenTitle: true,
      })

      await webview.once('tauri://created', () => {
        info('New window created for session', 'webview', { sessionId: session.id })
      })

      await webview.once('tauri://error', (e) => {
        logError(e, 'Error creating window', 'webview')
      })
    } catch (error) {
      logError(error, 'Failed to open session in new window', 'webview')
      toast({
        title: t('common.error'),
        description: t('welcome.failedOpenWindow', { error: String(error) }),
        variant: 'destructive',
      })
    }
  }

  const handleProfileSaved = (profileId: string) => {
    setViewMode('main')
    setEditingProfile(null)
    loadProfiles().then(() => {
      const profile = useAppStore.getState().profiles.find(p => p.id === profileId)
      if (profile) {
        setCurrentProfile(profile)
      }
    })
  }

  const handleBucketSelect = async (bucketName: string) => {
    if (!currentProfile) return

    try {
      // Create a session for this bucket using current profile credentials
      const config = {
        type: 'r2' as const,
        account_id: currentProfile.account_id,
        access_key_id: currentProfile.access_key_id,
        secret_access_key: currentProfile.secret_access_key,
        bucket_name: bucketName,
        region: 'auto',
        endpoint: '',
        force_path_style: false,
      }

      const sessionId = await createSession(config)
      handleSessionSelect(sessionId)
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('welcome.failedOpenBucket', { error: String(error) }),
        variant: 'destructive',
      })
    }
  }

  const handleDeleteBucket = async (bucket: BucketInfo) => {
    try {
      const isEmpty = await checkBucketEmpty(bucket.name)

      if (!isEmpty) {
        toast({
          title: t('welcome.bucketNotEmpty'),
          description: t('welcome.bucketNotEmptyDescription'),
          variant: 'destructive',
        })
        return
      }

      if (confirm(t('welcome.deleteBucketConfirm', { name: bucket.name }))) {
        await deleteBucket(bucket.name)
        toast({
          title: t('common.success'),
          description: t('welcome.bucketDeleteSuccess', { name: bucket.name }),
        })
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('welcome.bucketDeleteFailed', { error: String(error) }),
        variant: 'destructive',
      })
    }
  }

  const renderMainView = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 select-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary shadow-lg">
            <Icons.database className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t('welcome.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('welcome.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setEditingProfile(currentProfile)
              setViewMode('manage-profile')
            }}
            variant="outline"
            className="shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Icons.settings className="h-4 w-4 mr-2" />
            {t('welcome.setupProfile')}
          </Button>
          <Button
            onClick={() => {
              setSelectedProvider('r2')
              setEditingSession(null)
              setViewMode('new-session')
            }}
            className="shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Icons.plus className="h-4 w-4 mr-2" />
            {t('welcome.newConnection')}
          </Button>
        </div>
      </div>

      {/* Profile Selector */}
      {profiles.length > 0 && (
        <div className="mb-6">
          <ProfileSelector
            profiles={profiles}
            currentProfile={currentProfile}
            onProfileChange={setCurrentProfile}
            onManageProfiles={() => {
              setEditingProfile(currentProfile)
              setViewMode('manage-profile')
            }}
          />
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Buckets Column */}
        <Card className="flex flex-col border-border shadow-xl">
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Icons.database className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">{t('welcome.availableBuckets')}</h3>
              {currentProfile && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {profileBuckets.length} {profileBuckets.length === 1 ? t('welcome.bucket') : t('welcome.buckets')}
                </span>
              )}
            </div>
          </div>
          <CardContent className="p-4 flex-1 overflow-auto">
            {currentProfile ? (
              <BucketList
                buckets={profileBuckets}
                onBucketSelect={handleBucketSelect}
                onManageCors={setCorsManagementBucket}
                onDeleteBucket={handleDeleteBucket}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground select-none">
                <div className="text-center max-w-md">
                  <Icons.cloud className="h-16 w-16 mx-auto mb-4 opacity-40" />
                  <p className="text-sm font-medium mb-2">{t('welcome.noProfileSelected')}</p>
                  <p className="text-xs leading-relaxed">
                    {t('welcome.noProfileDescription')}
                  </p>
                  <Button
                    onClick={() => {
                      setEditingProfile(null)
                      setViewMode('manage-profile')
                    }}
                    size="sm"
                    className="mt-4"
                  >
                    <Icons.plus className="h-3 w-3 mr-2" />
                    {t('welcome.setupProfile')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sessions Column */}
        <Card className="flex flex-col border-border shadow-xl">
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Icons.clock className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">{t('welcome.recentSessions')}</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {sessions.length} {sessions.length === 1 ? t('welcome.session') : t('welcome.sessions')}
              </span>
            </div>
          </div>
          <CardContent className="p-4 flex-1 overflow-auto">
            {sessions.length > 0 ? (
              <SessionList
                sessions={sessions}
                onSessionSelect={handleSessionSelect}
                onSessionEdit={handleSessionEdit}
                onSessionDelete={handleSessionDelete}
                onSessionOpenInWindow={handleSessionOpenInWindow}
                showAll={true}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground select-none">
                <div className="text-center max-w-md">
                  <Icons.folder className="h-16 w-16 mx-auto mb-4 opacity-40" />
                  <p className="text-sm font-medium mb-2">{t('welcome.noSessions')}</p>
                  <p className="text-xs leading-relaxed">
                    {t('welcome.noSessionsDescription')}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )

  const renderFormView = () => {
    let title = t('welcome.addConnection')
    let icon = <Icons.plus className="h-5 w-5 text-primary-foreground" />

    if (viewMode === 'edit-session') {
      title = t('welcome.editConnection')
      icon = <Icons.edit className="h-5 w-5 text-primary-foreground" />
    } else if (viewMode === 'manage-profile') {
      title = editingProfile ? t('welcome.editProfile') : t('welcome.setupProfile')
      icon = <Icons.settings className="h-5 w-5 text-primary-foreground" />
    }

    return (
      <>
        <div className="flex items-center justify-between mb-6 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-lg">{icon}</div>
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {viewMode === 'manage-profile'
                  ? t('welcome.configureCredentials')
                  : t('welcome.configureStorageCredentials')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setViewMode('main')
                setEditingSession(null)
                setEditingProfile(null)
              }}
              className="hover:bg-accent"
            >
              <Icons.back className="h-4 w-4 mr-2" />
              {t('welcome.backToMain')}
            </Button>
          </div>

          <Card className="flex-1 min-h-0 border-border shadow-xl overflow-hidden">
            <CardContent className="p-8 h-full overflow-auto">
              {viewMode === 'manage-profile' ? (
                <ProfileForm
                  onProfileSaved={handleProfileSaved}
                  editingProfile={editingProfile}
                />
              ) : (
                <SessionForm
                  onSessionCreated={handleSessionCreated}
                  initialData={editingSession ? editingSession.config : { type: selectedProvider }}
                  sessionId={editingSession?.id}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-background p-8 relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-transparent to-zinc-100 dark:from-zinc-950 dark:via-transparent dark:to-zinc-900" />
        <div className="absolute top-0 -left-4 w-96 h-96 bg-zinc-400/5 dark:bg-zinc-500/10 rounded-full filter blur-3xl animate-blob" />
        <div className="absolute top-0 -right-4 w-96 h-96 bg-zinc-500/5 dark:bg-zinc-400/10 rounded-full filter blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-zinc-300/5 dark:bg-zinc-600/10 rounded-full filter blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute inset-0 opacity-30 dark:opacity-100 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      <div className={`relative w-full ${viewMode === 'main' ? 'max-w-7xl' : 'max-w-2xl'} mx-auto h-full flex flex-col transition-all duration-300`}>
        {viewMode === 'main' ? renderMainView() : renderFormView()}
      </div>

      {/* CORS Management Dialog */}
      <CorsManagementDialog
        bucket={corsManagementBucket}
        open={!!corsManagementBucket}
        onClose={() => setCorsManagementBucket(null)}
      />
    </div>
  )
}
