import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { SessionForm } from '@/components/welcome/SessionForm'
import { SessionList } from '@/components/welcome/SessionList'
import { BucketList } from '@/components/welcome/BucketList'
import { ProfileSelector } from '@/components/welcome/ProfileSelector'
import { CorsManagementDialog } from '@/components/dialogs/CorsManagementDialog'
import { ProfileManagementDialog } from '@/components/dialogs/ProfileManagementDialog'
import { DeleteBucketDialog } from '@/components/dialogs/DeleteBucketDialog'
import { SessionData, BucketInfo } from '@/types'
import { toast } from '@/hooks/use-toast'
import { info, logError } from '@/lib/logger'
import { useTabManager } from '@/hooks/use-tab-manager'
import { createSessionWindow } from '@/lib/tab-sync'

type ViewMode = 'main' | 'new-session' | 'edit-session'

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
  const [corsManagementBucket, setCorsManagementBucket] = useState<BucketInfo | null>(null)
  const [deleteBucketTarget, setDeleteBucketTarget] = useState<BucketInfo | null>(null)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) {
      return
    }

    initializedRef.current = true
    void loadProfiles().then(() => {
      const availableProfiles = useAppStore.getState().profiles
      if (availableProfiles.length > 0 && !useAppStore.getState().currentProfile) {
        setCurrentProfile(availableProfiles[0])
      }
    })
  }, [loadProfiles, setCurrentProfile])

  const handleSessionSelect = (sessionId: string) => {
    const session = useAppStore.getState().sessions.find(s => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
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
    if (!confirm(t('welcome.deleteSessionConfirm'))) {
      return
    }

    try {
      await removeSession(sessionId)
    } catch (error) {
      toast({
        title: t('common.error'),
        description: String(error),
        variant: 'destructive',
      })
    }
  }

  const handleSessionOpenInWindow = async (session: SessionData) => {
    try {
      const bucketName = session.config.bucket_name

      const webview = await createSessionWindow({
        sessionId: session.id,
        title: `${bucketName} - R2 Browser`,
        minWidth: 800,
        minHeight: 600,
      })

      if (webview) {
        info('New window created for session', 'webview', { sessionId: session.id })
      }
    } catch (error) {
      logError(error, 'Failed to open session in new window', 'webview')
      toast({
        title: t('common.error'),
        description: t('welcome.failedOpenWindow', { error: String(error) }),
        variant: 'destructive',
      })
    }
  }

  const handleBucketSelect = async (bucketName: string) => {
    if (!currentProfile) return

    try {
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

  const handleDeleteBucketRequest = async (bucket: BucketInfo) => {
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

      setDeleteBucketTarget(bucket)
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('welcome.bucketDeleteFailed', { error: String(error) }),
        variant: 'destructive',
      })
    }
  }

  const handleDeleteBucketConfirm = async (bucket: BucketInfo) => {
    try {
      await deleteBucket(bucket.name)
      toast({
        title: t('common.success'),
        description: t('welcome.bucketDeleteSuccess', { name: bucket.name }),
      })
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('welcome.bucketDeleteFailed', { error: String(error) }),
        variant: 'destructive',
      })
    }
  }

  const startConnection = () => {
    setSelectedProvider('r2')
    setEditingSession(null)
    setViewMode('new-session')
  }

  const renderMainView = () => (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{t('welcome.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('welcome.subtitle')}</p>
        </div>
        <Button size="sm" onClick={startConnection}>
          <Icons.plus className="mr-2 h-4 w-4" />
          {t('welcome.newConnection')}
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <section className="min-w-0" aria-labelledby="recent-sessions-heading">
          <div className="flex h-12 items-center gap-2 border-b border-border mb-2">
            <h2 id="recent-sessions-heading" className="text-sm font-medium">{t('welcome.recentSessions')}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{sessions.length}</span>
          </div>
          {sessions.length > 0 ? (
            <SessionList
              sessions={sessions}
              onSessionSelect={handleSessionSelect}
              onSessionEdit={handleSessionEdit}
              onSessionDelete={handleSessionDelete}
              onSessionOpenInWindow={handleSessionOpenInWindow}
              showAll
            />
          ) : (
            <div className="py-10 text-sm">
              <Icons.folder className="h-6 w-6 mb-4 text-muted-foreground" />
              <p className="font-medium">{t('welcome.noSessions')}</p>
              <p className="mt-1 max-w-xs leading-relaxed text-muted-foreground">{t('welcome.noSessionsDescription')}</p>
            </div>
          )}
        </section>

        <section className="min-w-0" aria-labelledby="buckets-heading">
          <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border mb-2 py-1">
            <h2 id="buckets-heading" className="text-sm font-medium">{t('welcome.availableBuckets')}</h2>
            {currentProfile && <span className="text-xs tabular-nums text-muted-foreground">{profileBuckets.length}</span>}
            <div className="ml-auto min-w-0">
              {profiles.length > 0 && (
                <ProfileSelector
                  profiles={profiles}
                  currentProfile={currentProfile}
                  onProfileChange={setCurrentProfile}
                  onManageProfiles={() => setProfileDialogOpen(true)}
                />
              )}
            </div>
          </div>
          {currentProfile ? (
            <BucketList
              buckets={profileBuckets}
              onBucketSelect={handleBucketSelect}
              onManageCors={setCorsManagementBucket}
              onDeleteBucket={handleDeleteBucketRequest}
            />
          ) : (
            <div className="py-10 text-sm">
              <Icons.cloud className="h-6 w-6 mb-4 text-muted-foreground" />
              <p className="font-medium">{t('welcome.noProfileSelected')}</p>
              <p className="mt-1 max-w-xs leading-relaxed text-muted-foreground">{t('welcome.noProfileDescription')}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setProfileDialogOpen(true)}>
                {t('welcome.setupProfile')}
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  )

  const renderFormView = () => (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2 self-start"
        onClick={() => {
          setViewMode('main')
          setEditingSession(null)
        }}
      >
        <Icons.back className="mr-2 h-4 w-4" />
        {t('welcome.backToMain')}
      </Button>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          {viewMode === 'edit-session' ? t('welcome.editConnection') : t('welcome.addConnection')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('welcome.configureStorageCredentials')}</p>
      </header>
      <SessionForm
        onSessionCreated={handleSessionCreated}
        initialData={editingSession ? editingSession.config : { type: selectedProvider }}
        sessionId={editingSession?.id}
      />
    </>
  )

  return (
    <div className="h-full w-full overflow-auto bg-background px-5 py-8 sm:px-8">
      <div key={viewMode} className={`welcome-content mx-auto flex w-full flex-col ${viewMode === 'main' ? 'max-w-5xl' : 'max-w-lg'}`}>
        {viewMode === 'main' ? renderMainView() : renderFormView()}
      </div>

      <CorsManagementDialog
        bucket={corsManagementBucket}
        open={!!corsManagementBucket}
        onClose={() => setCorsManagementBucket(null)}
      />

      <ProfileManagementDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
      />

      <DeleteBucketDialog
        bucket={deleteBucketTarget}
        open={!!deleteBucketTarget}
        onClose={() => setDeleteBucketTarget(null)}
        onConfirm={handleDeleteBucketConfirm}
      />
    </div>
  )
}
