import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/providers/ThemeProvider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePreferencesStore } from '@/stores/preferences-store'
import { useAppStore } from '@/stores/app-store'
import { toast } from '@/hooks/use-toast'
import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { supportedLanguages } from '@/i18n'
import { StorageSyncStatus } from '@/types'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCheckForUpdates?: () => void
}

export function SettingsDialog({ open, onOpenChange, onCheckForUpdates }: SettingsDialogProps) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const {
    appInfo,
    currentSession,
    currentProfile,
    loadSessions,
    loadProfiles,
    loadSessionStats,
    setCurrentSession,
    setCurrentProfile,
  } = useAppStore()
  const {
    updateChannel,
    setUpdateChannel,
    downloadFolder,
    askDownloadLocation,
    setDownloadFolder,
    setAskDownloadLocation,
    defaultViewMode,
    setDefaultViewMode,
    confirmDelete,
    setConfirmDelete,
    confirmOverwrite,
    setConfirmOverwrite,
    maxConcurrentUploads,
    setMaxConcurrentUploads,
    maxConcurrentDownloads,
    setMaxConcurrentDownloads,
  } = usePreferencesStore()
  const [systemDownloadFolder, setSystemDownloadFolder] = useState<string>('')
  const [storageSyncStatus, setStorageSyncStatus] = useState<StorageSyncStatus | null>(null)
  const [storageSyncLoading, setStorageSyncLoading] = useState(false)
  const [storageSyncSaving, setStorageSyncSaving] = useState(false)

  const loadStorageSyncStatus = useCallback(async () => {
    setStorageSyncLoading(true)
    try {
      const status = await invoke<StorageSyncStatus>('get_storage_sync_status')
      setStorageSyncStatus(status)
    } catch {
      setStorageSyncStatus(null)
      toast({
        title: t('common.error'),
        description: t('settings.storageSyncLoadFailed'),
        variant: 'destructive',
      })
    } finally {
      setStorageSyncLoading(false)
    }
  }, [t])

  useEffect(() => {
    // Get system default download folder when dialog opens
    if (open) {
      invoke<string>('get_download_folder')
        .then((folder: string) => setSystemDownloadFolder(folder))
        .catch(() => setSystemDownloadFolder(''))
      void loadStorageSyncStatus()
    }
  }, [loadStorageSyncStatus, open])

  const handleStorageSyncToggle = async (enabled: boolean) => {
    if (!storageSyncStatus?.supportsIcloudSync) {
      return
    }

    setStorageSyncSaving(true)

    try {
      const status = await invoke<StorageSyncStatus>('set_storage_sync_enabled', { enabled })
      setStorageSyncStatus(status)

      const previousSessionId = currentSession?.id ?? null
      const previousProfileId = currentProfile?.id ?? null

      await Promise.all([loadSessions(), loadProfiles(), loadSessionStats()])

      const store = useAppStore.getState()

      if (
        previousSessionId &&
        !store.sessions.some((session) => session.id === previousSessionId)
      ) {
        setCurrentSession(null)
      }

      if (
        previousProfileId &&
        !store.profiles.some((profile) => profile.id === previousProfileId)
      ) {
        setCurrentProfile(null)
      }

      toast({
        title: t('settings.storageSyncSaved'),
        description:
          enabled && !status.icloudAvailable
            ? t('settings.storageSyncWaitingForIcloud')
            : status.usingIcloudStorage
              ? t('settings.storageSyncEnabledMessage')
              : t('settings.storageSyncDisabledMessage'),
      })
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
      await loadStorageSyncStatus()
    } finally {
      setStorageSyncSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your application settings and preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="downloads">Downloads</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
            <TabsContent value="general" className="space-y-4 mt-0">
              <div className="space-y-4 select-none">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Default View</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose the default view mode for file listings
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDefaultViewMode('list')}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
                      defaultViewMode === 'list' ? 'border-primary' : 'border-border'
                    }`}
                  >
                    <Icons.list className="h-6 w-6" />
                    <span className="text-sm font-medium">List View</span>
                    {defaultViewMode === 'list' && (
                      <div className="absolute top-2 right-2">
                        <Icons.check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </button>

                  <button
                    onClick={() => setDefaultViewMode('grid')}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
                      defaultViewMode === 'grid' ? 'border-primary' : 'border-border'
                    }`}
                  >
                    <Icons.grid className="h-6 w-6" />
                    <span className="text-sm font-medium">Grid View</span>
                    {defaultViewMode === 'grid' && (
                      <div className="absolute top-2 right-2">
                        <Icons.check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-base font-semibold">{t('settings.storageSync')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.storageSyncDescription')}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5 pr-4">
                      <Label className="text-sm font-medium">{t('settings.enableIcloudSync')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.enableIcloudSyncDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={storageSyncStatus?.icloudSyncEnabled ?? false}
                      disabled={
                        storageSyncLoading ||
                        storageSyncSaving ||
                        !storageSyncStatus ||
                        !storageSyncStatus.supportsIcloudSync
                      }
                      onCheckedChange={handleStorageSyncToggle}
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {storageSyncStatus?.usingIcloudStorage ? (
                          <Icons.cloud className="h-4 w-4 text-primary" />
                        ) : (
                          <Icons.folder className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">
                          {t('settings.currentStorageLocation')}
                        </span>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {storageSyncLoading
                          ? t('common.loading')
                          : storageSyncStatus?.usingIcloudStorage
                            ? t('settings.storageModeIcloud')
                            : t('settings.storageModeLocal')}
                      </span>
                    </div>

                    <div className="rounded-md bg-muted/30 px-3 py-2 text-xs break-all font-mono">
                      {storageSyncLoading
                        ? t('common.loading')
                        : storageSyncStatus?.activeStoragePath ?? '-'}
                    </div>

                    {!storageSyncLoading && storageSyncStatus && (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {t('settings.localStorageLocation')}
                            </Label>
                            <div className="rounded-md bg-muted/20 px-3 py-2 text-xs break-all font-mono">
                              {storageSyncStatus.localStoragePath}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {t('settings.icloudStorageLocation')}
                            </Label>
                            <div className="rounded-md bg-muted/20 px-3 py-2 text-xs break-all font-mono">
                              {storageSyncStatus.icloudStoragePath ?? t('settings.icloudUnavailable')}
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {!storageSyncStatus.supportsIcloudSync
                            ? t('settings.storageSyncUnsupported')
                            : storageSyncStatus.icloudSyncEnabled && !storageSyncStatus.icloudAvailable
                              ? t('settings.storageSyncUnavailable')
                              : storageSyncStatus.usingIcloudStorage
                                ? t('settings.storageSyncActive')
                                : t('settings.storageSyncLocalOnly')}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-base font-semibold">Confirmations</Label>
                  <p className="text-sm text-muted-foreground">
                    Control when confirmation dialogs are shown
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Confirm before deleting</Label>
                      <p className="text-xs text-muted-foreground">
                        Show a confirmation dialog before deleting files
                      </p>
                    </div>
                    <Switch
                      checked={confirmDelete}
                      onCheckedChange={setConfirmDelete}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Confirm before overwriting</Label>
                      <p className="text-xs text-muted-foreground">
                        Show a confirmation dialog when uploading files that already exist
                      </p>
                    </div>
                    <Switch
                      checked={confirmOverwrite}
                      onCheckedChange={setConfirmOverwrite}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 mt-0">
              <div className="space-y-2 select-none">
                <Label className="text-base font-semibold">Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Select the theme for the application
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 select-none">
                {/* Light Theme */}
                <button
                  onClick={() => setTheme('light')}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
                    theme === 'light' ? 'border-primary' : 'border-border'
                  }`}
                >
                  <Icons.sun className="h-6 w-6" />
                  <span className="text-sm font-medium">Light</span>
                  {theme === 'light' && (
                    <div className="absolute top-2 right-2">
                      <Icons.check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>

                {/* Dark Theme */}
                <button
                  onClick={() => setTheme('dark')}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
                    theme === 'dark' ? 'border-primary' : 'border-border'
                  }`}
                >
                  <Icons.moon className="h-6 w-6" />
                  <span className="text-sm font-medium">Dark</span>
                  {theme === 'dark' && (
                    <div className="absolute top-2 right-2">
                      <Icons.check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>

                {/* System Theme */}
                <button
                  onClick={() => setTheme('system')}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
                    theme === 'system' ? 'border-primary' : 'border-border'
                  }`}
                >
                  <Icons.monitor className="h-6 w-6" />
                  <span className="text-sm font-medium">System</span>
                  {theme === 'system' && (
                    <div className="absolute top-2 right-2">
                      <Icons.check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>
              </div>

              <Separator />

              {/* Language Section */}
              <div className="space-y-2 select-none">
                <Label className="text-base font-semibold">{t('settings.language')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.languageDescription')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 select-none">
                {supportedLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => i18n.changeLanguage(lang.code)}
                    className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
                      i18n.language === lang.code ? 'border-primary' : 'border-border'
                    }`}
                  >
                    <span className="text-lg font-medium">{lang.nativeName}</span>
                    <span className="text-xs text-muted-foreground">{lang.name}</span>
                    {i18n.language === lang.code && (
                      <div className="absolute top-2 right-2">
                        <Icons.check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="downloads" className="space-y-4 mt-0">
              <div className="space-y-4 select-none">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Download Location</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose where downloaded files will be saved
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Always ask where to save files</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Show a dialog to choose the save location for each download
                      </p>
                    </div>
                    <Switch
                      checked={askDownloadLocation}
                      onCheckedChange={setAskDownloadLocation}
                    />
                  </div>

                  {!askDownloadLocation && (
                    <div className="space-y-2">
                      <Label className="text-sm">Default Download Folder</Label>
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-md border px-3 py-2 text-sm bg-muted/30">
                          <div className="flex items-center gap-2">
                            <Icons.folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">
                              {downloadFolder || systemDownloadFolder || 'System default (Downloads)'}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            // Use Tauri dialog to choose folder
                            const { open } = await import('@tauri-apps/plugin-dialog')
                            const selected = await open({
                              directory: true,
                              multiple: false,
                              defaultPath: downloadFolder || systemDownloadFolder,
                            })
                            if (selected && typeof selected === 'string') {
                              setDownloadFolder(selected)
                            }
                          }}
                        >
                          <Icons.folder className="h-4 w-4 mr-2" />
                          Browse
                        </Button>
                        {downloadFolder && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDownloadFolder(null)}
                            title="Reset to system default"
                          >
                            <Icons.refresh className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Files will be saved to this folder automatically without prompting
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-base font-semibold">Transfer Limits</Label>
                  <p className="text-sm text-muted-foreground">
                    Control the maximum number of simultaneous transfers
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Max concurrent uploads</Label>
                      <p className="text-xs text-muted-foreground">
                        Maximum number of files uploading at once (1-10)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setMaxConcurrentUploads(Math.max(1, maxConcurrentUploads - 1))}
                        disabled={maxConcurrentUploads <= 1}
                      >
                        <Icons.minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{maxConcurrentUploads}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setMaxConcurrentUploads(Math.min(10, maxConcurrentUploads + 1))}
                        disabled={maxConcurrentUploads >= 10}
                      >
                        <Icons.plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Max concurrent downloads</Label>
                      <p className="text-xs text-muted-foreground">
                        Maximum number of files downloading at once (1-10)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setMaxConcurrentDownloads(Math.max(1, maxConcurrentDownloads - 1))}
                        disabled={maxConcurrentDownloads <= 1}
                      >
                        <Icons.minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{maxConcurrentDownloads}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setMaxConcurrentDownloads(Math.min(10, maxConcurrentDownloads + 1))}
                        disabled={maxConcurrentDownloads >= 10}
                      >
                        <Icons.plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="about" className="space-y-4 mt-0">
              <div className="space-y-4 select-none">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icons.cloud className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">R2 Browser</h3>
                    <p className="text-sm text-muted-foreground">
                      Cloudflare R2 and S3-compatible storage manager
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-medium">{appInfo?.version ?? '0.1.0'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Platform</span>
                    <span className="font-medium">
                      {typeof window !== 'undefined' && 'userAgent' in navigator
                        ? navigator.platform
                        : 'Unknown'}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Open Source</h4>
                  <p className="text-sm text-muted-foreground">
                    This application is open source and available on GitHub.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      window.open('https://github.com/yourusername/r2browser', '_blank')
                    }}
                  >
                    View on GitHub
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Technologies</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-muted-foreground">React 19</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      <span className="text-muted-foreground">TypeScript</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-purple-500" />
                      <span className="text-muted-foreground">Tauri</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-muted-foreground">Vite</span>
                    </div>
                  </div>
                </div>

                <>
                  <Separator />

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Update Channel</h4>
                      <p className="text-sm text-muted-foreground">
                        Choose whether automatic update checks use stable releases only or include beta previews.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setUpdateChannel('stable')}
                        className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-colors hover:bg-accent ${
                          updateChannel === 'stable' ? 'border-primary' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icons.check className="h-4 w-4" />
                          <span className="text-sm font-medium">Stable</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Recommended for everyday use. Auto-updates only when official releases are published.
                        </p>
                      </button>

                      <button
                        onClick={() => setUpdateChannel('beta')}
                        className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-colors hover:bg-accent ${
                          updateChannel === 'beta' ? 'border-primary' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icons.refresh className="h-4 w-4" />
                          <span className="text-sm font-medium">Beta</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Receive beta builds and newer stable releases. Switching to stable never downgrades your installed version.
                        </p>
                      </button>
                    </div>
                  </div>
                </>

                {onCheckForUpdates && (
                  <>
                    <Separator />

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Updates</h4>
                      <p className="text-sm text-muted-foreground">
                        Manually check the selected {updateChannel === 'beta' ? 'beta' : 'stable'} channel for a new version.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          onCheckForUpdates()
                          onOpenChange(false)
                        }}
                      >
                        <Icons.refresh className="h-4 w-4 mr-2" />
                        Check for Updates
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
