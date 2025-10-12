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
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCheckForUpdates?: () => void
}

export function SettingsDialog({ open, onOpenChange, onCheckForUpdates }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme()
  const { downloadFolder, askDownloadLocation, setDownloadFolder, setAskDownloadLocation } = usePreferencesStore()
  const [systemDownloadFolder, setSystemDownloadFolder] = useState<string>('')

  useEffect(() => {
    // Get system default download folder when dialog opens
    if (open) {
      invoke<string>('get_download_folder')
        .then(folder => setSystemDownloadFolder(folder))
        .catch(() => setSystemDownloadFolder(''))
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your application settings and preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="downloads">Downloads</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
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
                    <span className="font-medium">0.1.0</span>
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
                      <span className="text-muted-foreground">React 18</span>
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

                {onCheckForUpdates && (
                  <>
                    <Separator />

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Updates</h4>
                      <p className="text-sm text-muted-foreground">
                        Check for the latest version of the application
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
