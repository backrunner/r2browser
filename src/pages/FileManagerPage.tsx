import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/app-store'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb } from '@/components/file-explorer/Breadcrumb'
import { FileList } from '@/components/file-explorer/FileList'
import { FileUploadDialog } from '@/components/dialogs/FileUploadDialog'
import { FilePreviewDialog } from '@/components/dialogs/FilePreviewDialog'
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog'
import { BreadcrumbItem, FileItem } from '@/types'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Progress } from '@/components/ui/progress'

export function FileManagerPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const {
    sessions,
    currentSession,
    setCurrentSession,
    currentPath,
    files,
    selectedFiles,
    isLoading,
    viewMode,
    searchQuery,
    navigateToPath,
    goUp,
    selectFile,
    selectFiles,
    clearSelection,
    loadFiles,
    createFolder,
    setViewMode,
    setSearchQuery
  } = useAppStore()

  // Compute disabled states for nav buttons
  const canGoUp = !!currentPath && currentPath.split('/').filter(Boolean).length > 0

  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const uploads = useAppStore((s) => (s as any).uploads)
  const enqueueUploads = useAppStore((s) => (s as any).enqueueUploads)
  const enqueueUploadsFromPaths = useAppStore((s) => (s as any).enqueueUploadsFromPaths)
  const activeUploadCount = (uploads || []).filter((u: any) => u.status === 'pending' || u.status === 'uploading').length
  const [showDropOverlay, setShowDropOverlay] = useState(false)
  const suppressDomDropRef = useRef(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId)
      if (session) {
        setCurrentSession(session)
        // Load root files
        loadFiles('')
      } else {
        // Session not found, redirect to welcome page
        navigate('/')
      }
    }
  }, [sessionId, sessions, setCurrentSession, navigate, loadFiles])

  // Tauri OS-level file drop events (works even when DOM drag events do not)
  useEffect(() => {
    let unlistenHover: (() => void) | undefined
    let unlistenDrop: (() => void) | undefined
    let unlistenCancel: (() => void) | undefined
    ;(async () => {
      try {
        unlistenHover = await listen<string[]>('tauri://file-drop-hover', () => {
          suppressDomDropRef.current = true
          setShowDropOverlay(true)
        })
        unlistenDrop = await listen<{ paths: string[] } | string[]>('tauri://file-drop', (e) => {
          setShowDropOverlay(false)
          // Payload shape can be array or object depending on platform/bindings
          const payload: any = e.payload
          const paths: string[] = Array.isArray(payload)
            ? payload as string[]
            : (payload?.paths as string[]) || []
          if (paths.length > 0) {
            enqueueUploadsFromPaths(paths, currentPath)
          }
          setTimeout(() => { suppressDomDropRef.current = false }, 50)
        })
        unlistenCancel = await listen('tauri://file-drop-cancelled', () => {
          setShowDropOverlay(false)
          suppressDomDropRef.current = false
        })
      } catch (err) {
        // ignore if not in Tauri
      }
    })()
    return () => {
      try { unlistenHover && unlistenHover() } catch {}
      try { unlistenDrop && unlistenDrop() } catch {}
      try { unlistenCancel && unlistenCancel() } catch {}
    }
  }, [enqueueUploadsFromPaths, currentPath])

  const buildBreadcrumbItems = (): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [{ name: 'Home', path: '' }]

    if (currentPath) {
      const pathParts = currentPath.split('/').filter(Boolean)
      let accumulatedPath = ''

      for (const part of pathParts) {
        accumulatedPath += accumulatedPath ? `/${part}` : part
        items.push({ name: part, path: accumulatedPath })
      }
    }

    return items
  }

  const handleFileClick = (file: FileItem, e: React.MouseEvent) => {
    // Windows-like selection behavior
    const currentList = filteredFiles // use current filtered order
    const idx = currentList.findIndex(f => f.key === file.key)
    const isShift = e.shiftKey
    const isToggle = e.ctrlKey || e.metaKey

    if (isShift && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, idx)
      const end = Math.max(lastSelectedIndex, idx)
      const rangeKeys = currentList.slice(start, end + 1).map(f => f.key)
      if (isToggle) {
        // Union with existing selection
        const set = new Set(selectedFiles)
        rangeKeys.forEach(k => set.add(k))
        selectFiles(Array.from(set))
      } else {
        selectFiles(rangeKeys)
      }
    } else if (isToggle) {
      // Toggle single item
      const set = new Set(selectedFiles)
      if (set.has(file.key)) set.delete(file.key)
      else set.add(file.key)
      selectFiles(Array.from(set))
    } else {
      // Single selection
      selectFiles([file.key])
    }
    setLastSelectedIndex(idx)
  }

  const handleFileDoubleClick = (file: FileItem) => {
    if (file.type === 'folder') {
      navigateToPath(file.key)
    } else {
      // Show preview for files
      setPreviewFile(file)
      setShowPreviewDialog(true)
    }
  }

  const handleFileSelect = (_key: string, _selected: boolean) => {
    selectFile(_key)
  }

  const handleBreadcrumbNavigate = (path: string) => {
    navigateToPath(path)
  }

  const handleGoUp = () => {
    goUp()
  }

  const handleRefresh = () => {
    loadFiles(currentPath)
  }

  const handleFilesMove = async (_files: FileItem[], _targetPath: string) => {
    // console.log('Move files:', _files, 'to:', _targetPath)
    // TODO: Implement file move functionality
  }

  const handleFilesDrop = async (_files: File[], _targetPath: string) => {
    const path = _targetPath && _targetPath.endsWith('/') ? _targetPath.replace(/\/$/, '') : currentPath
    await enqueueUploads(_files, path)
  }

  const handleDownload = async (_files: FileItem[]) => {
    // console.log('Download files:', _files)
    // TODO: Implement file download functionality
  }

  const handleRename = async (_file: FileItem) => {
    // console.log('Rename file:', _file)
    // TODO: Implement file rename functionality
  }

  const handleDelete = async (_files: FileItem[]) => {
    // console.log('Delete files:', _files)
    // TODO: Implement file delete functionality
  }

  const handleCreateFolder = async () => {
    setShowNewFolderDialog(true)
  }

  const handleCreateFolderConfirm = async (folderName: string) => {
    const base = currentPath ? (currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath) : ''
    const prefix = `${base ? base + '/' : ''}${folderName}/`
    await createFolder(prefix)
    await loadFiles(currentPath)
  }

  const handleUpload = async () => {
    setShowUploadDialog(true)
  }

  const handleUploadFiles = async (_files: File[], _path: string) => {
    await enqueueUploads(_files, currentPath)
  }

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!currentSession) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Icons.loading className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => navigate('/')}
                title="Home"
              >
                <Icons.home className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => goUp()}
                title="Back to parent"
                disabled={!canGoUp}
              >
                <Icons.back className="h-4 w-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-5 mx-2" />
            <div>
              <h1 className="font-semibold text-sm leading-none">{currentSession.name}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentSession.config.bucket_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Icons.search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 h-8 text-sm pl-8"
              />
            </div>

            <Separator orientation="vertical" className="h-5" />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-8 px-2"
              title="Refresh"
            >
              <Icons.refresh className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="h-8 px-2"
              title={viewMode === 'list' ? 'Grid view' : 'List view'}
            >
              {viewMode === 'list' ? (
                <Icons.grid className="h-4 w-4" />
              ) : (
                <Icons.list className="h-4 w-4" />
              )}
            </Button>

            {/* Uploads task center with badge and popup list */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="sm" className="relative h-8 w-8 p-0" title="Tasks">
                  <Icons.list className="h-4 w-4" />
                  {activeUploadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center">
                      {activeUploadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content sideOffset={6} className="z-50 min-w-[300px] max-h-[300px] overflow-auto border bg-background rounded-md p-3 shadow-md">
                <div className="text-sm font-medium mb-2 flex items-center">
                  <Icons.list className="h-4 w-4 mr-2" /> Tasks
                </div>
                {(!uploads || uploads.length === 0) ? (
                  <div className="text-sm text-muted-foreground p-2">No tasks</div>
                ) : (
                  <div className="space-y-3">
                    {uploads.slice().reverse().map((u: any) => (
                      <div key={u.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate max-w-[220px]" title={u.name}>{u.name}</span>
                          <span className="text-muted-foreground">{u.progress}%</span>
                        </div>
                        <Progress value={u.progress} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="capitalize">{u.status}</span>
                          <span>{u.speedBps > 0 ? `${(u.speedBps/1024).toFixed(1)} KB/s` : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            <Button variant="ghost" size="sm" className="h-8 px-2" title="Settings">
              <Icons.settings className="h-4 w-4" />
            </Button>

            {/* Primary Upload button at end of bar */}
            <Button size="sm" className="h-8" onClick={handleUpload}>
              <Icons.upload className="h-4 w-4 mr-2" /> Upload
            </Button>
          </div>
        </div>
      </header>

      {/* Breadcrumb only row removed per request */}

      {/* Main Content */}
      <main
        className="flex-1 overflow-hidden"
        onDragEnter={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
            dragCounter.current += 1
            setShowDropOverlay(true)
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
          }
        }}
        onDragLeave={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
            dragCounter.current = Math.max(0, dragCounter.current - 1)
            if (dragCounter.current === 0) setShowDropOverlay(false)
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            e.preventDefault()
            dragCounter.current = 0
            setShowDropOverlay(false)
            if (!suppressDomDropRef.current) {
              const files = Array.from(e.dataTransfer.files)
              handleFilesDrop(files, currentPath)
            }
          }
        }}
      >
        {/* Drop Overlay */}
        {showDropOverlay && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm">
            <div className="px-6 py-4 rounded-lg border-2 border-dashed border-primary/50 bg-card/80 shadow-sm text-center">
              <Icons.upload className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-sm text-muted-foreground">Drop to upload</div>
            </div>
          </div>
        )}
        <FileList
          files={filteredFiles}
          viewMode={viewMode}
          selectedFiles={selectedFiles}
          onFileClick={handleFileClick}
          onFileDoubleClick={handleFileDoubleClick}
          onFileSelect={handleFileSelect}
          onFilesMove={handleFilesMove}
          onFilesDrop={handleFilesDrop}
          onDownload={handleDownload}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreateFolder={handleCreateFolder}
          onUpload={handleUpload}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />
      </main>

      {/* Status Bar */}
      <footer className="border-t bg-muted/30 px-3 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3 min-w-0">
            <span className="truncate">Path: /{currentPath}</span>
            <span className="opacity-50">•</span>
            <span>
              {currentSession.config.type === 'r2' ? 'Cloudflare R2' : 'S3 Compatible'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              {filteredFiles.length} items{selectedFiles.length > 0 && ` (${selectedFiles.length} selected)`}
            </span>
            {isLoading && <span className="opacity-50">•</span>}
            {isLoading && (
              <>
                <Icons.loading className="h-3 w-3 animate-spin" />
                <span>Loading…</span>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Upload Dialog */}
      <FileUploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        currentPath={currentPath}
        onUpload={handleUploadFiles}
      />

      {/* Preview Dialog */}
      <FilePreviewDialog
        file={previewFile}
        open={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
      />

      {/* New Folder Dialog */}
      <NewFolderDialog
        open={showNewFolderDialog}
        onOpenChange={setShowNewFolderDialog}
        currentPath={currentPath}
        onCreate={handleCreateFolderConfirm}
      />
    </div>
  )
}
