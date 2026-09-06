import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAppStore } from '@/stores/app-store'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Progress } from '@/components/ui/progress'

export function TransferTasks() {
  const uploads = useAppStore(state => state.uploads)
  const activeUploadCount = uploads.filter(task => task.status === 'pending' || task.status === 'uploading').length
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0" title="Tasks">
          <Icons.clipboard className="h-4 w-4" />
          {activeUploadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center">
              {activeUploadCount}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content sideOffset={6} className="z-50 min-w-[340px] border border-border bg-background rounded-md p-0 shadow-lg select-none">
        <div className="px-3 py-2 border-b border-border sticky top-0 bg-background z-10">
          <div className="text-sm font-medium flex items-center">
            <Icons.clipboard className="h-4 w-4 mr-2" /> Tasks
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto p-3">
          {(!uploads || uploads.length === 0) ? (
            <div className="text-sm text-muted-foreground p-2">No tasks</div>
          ) : (
            <div className="space-y-3">
              {uploads.slice().reverse().map((u) => (
                <div key={u.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                      {u.type === 'download' ? (
                        <Icons.download className="h-3 w-3 flex-shrink-0 text-blue-500" />
                      ) : (
                        <Icons.upload className="h-3 w-3 flex-shrink-0 text-green-500" />
                      )}
                      <span className="truncate" title={u.name}>{u.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-muted-foreground">{u.progress}%</span>

                      {u.status === 'uploading' && (
                        <button
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Pause"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await useAppStore.getState().pauseUpload(u.id)
                          }}
                        >
                          <Icons.pause className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {u.status === 'paused' && (
                        <button
                          className="text-primary hover:text-primary/80 p-1"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await useAppStore.getState().resumeUpload(u.id)
                          }}
                          title="Resume"
                        >
                          <Icons.play className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {u.status === 'error' && (
                        <button
                          className="text-primary hover:text-primary/80 p-1"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await useAppStore.getState().resumeUpload(u.id)
                          }}
                          title="Retry"
                        >
                          <Icons.refresh className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {(u.status === 'uploading' || u.status === 'pending' || u.status === 'error' || u.status === 'paused') && (
                        <button
                          className="text-destructive hover:text-destructive/80 p-1"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await useAppStore.getState().cancelUpload(u.id)
                          }}
                          title="Cancel"
                        >
                          <Icons.x className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {u.status === 'completed' && (
                        <button
                          className="text-muted-foreground hover:text-foreground p-1"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await useAppStore.getState().removeUpload(u.id)
                          }}
                          title="Dismiss"
                        >
                          <Icons.x className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <Progress value={u.progress} />
                  {u.status === 'error' ? (
                    <div className="flex items-center text-xs text-destructive">
                      <Icons.error className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                      <span className="truncate" title={u.error || `${u.type === 'download' ? 'Download' : 'Upload'} failed`}>
                        {u.error || `${u.type === 'download' ? 'Download' : 'Upload'} failed`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{u.type === 'download' ? (u.status === 'uploading' ? 'downloading' : u.status) : u.status}</span>
                      <span>{u.speedBps > 0 ? `${(u.speedBps/1024).toFixed(1)} KB/s` : ''}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
