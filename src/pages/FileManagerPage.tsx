import React, { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useParams, useNavigate } from 'react-router-dom'
import { save } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '@/stores/app-store'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { FileList } from '@/components/file-explorer/FileList'
import { FileUploadDialog } from '@/components/dialogs/FileUploadDialog'
import { logUserAction } from '../lib/logger'
import { FilePreviewDialog } from '@/components/dialogs/FilePreviewDialog'
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog'
import { RenameDialog } from '@/components/dialogs/RenameDialog'
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog'
import { SettingsDialog } from '@/components/dialogs/SettingsDialog'
import { FileItem, FileDropPayload } from '@/types'
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
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameFile, setRenameFile] = useState<FileItem | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [filesToDelete, setFilesToDelete] = useState<FileItem[]>([])
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const uploads = useAppStore((s) => s.uploads)
  const enqueueUploads = useAppStore((s) => s.enqueueUploads)
  const activeUploadCount = (uploads || []).filter((u) => u.status === 'pending' || u.status === 'uploading').length
  const [showDropOverlay, setShowDropOverlay] = useState(false)
  const suppressDomDropRef = useRef(false)
  const dragCounter = useRef(0)
  const initializedSessionRef = useRef<string | null>(null) // Track which session has been initialized
  const listenersRegisteredRef = useRef(false) // Track if event listeners are registered

  useEffect(() => {
    // Only initialize if we haven't initialized this specific session yet
    if (sessionId && initializedSessionRef.current !== sessionId) {
      // Mark this session as initialized IMMEDIATELY to prevent race condition
      initializedSessionRef.current = sessionId

      const session = sessions.find(s => s.id === sessionId)
      if (session) {
        setCurrentSession(session)
        // Load root files using getState to avoid dependency
        useAppStore.getState().loadFiles('')
      } else {
        // Session not found, redirect to welcome page
        // Reset the flag since we're not actually initializing
        initializedSessionRef.current = null
        navigate('/')
      }
    }
  }, [sessionId, sessions, setCurrentSession, navigate])

  // Tauri OS-level file drop events (works even when DOM drag events do not)
  useEffect(() => {
    // Prevent duplicate listener registration in StrictMode
    if (listenersRegisteredRef.current) {
      logUserAction('Skipping duplicate listener registration (already registered)', { source: 'listener-setup' })
      return
    }

    // Mark as registered BEFORE async operations to prevent race condition
    listenersRegisteredRef.current = true

    let unlistenHover: (() => void) | undefined
    let unlistenDrop: (() => void) | undefined
    let unlistenCancel: (() => void) | undefined

    ;(async () => {
      try {
        await logUserAction('Registering Tauri file drop event listeners', { source: 'listener-setup' })

        unlistenHover = await listen<string[]>('tauri://file-drop-hover', async () => {
          await logUserAction('File drop hover detected (Tauri)', { source: 'tauri-event' })
          suppressDomDropRef.current = true
          setShowDropOverlay(true)
        })
        unlistenDrop = await listen<{ paths: string[] } | string[]>('tauri://file-drop', async (e) => {
          await logUserAction('File drop event received (Tauri)', { payloadType: typeof e.payload })
          setShowDropOverlay(false)
          // Payload shape can be array or object depending on platform/bindings
          const payload = e.payload as FileDropPayload
          const paths: string[] = Array.isArray(payload)
            ? payload as string[]
            : (payload?.paths as string[]) || []
          await logUserAction('Processed file drop paths', { pathCount: paths.length, paths: paths.map(p => p.split(/[/\\]/).pop()) })
          if (paths.length > 0) {
            // Use getState to get current values without causing re-renders
            const store = useAppStore.getState()
            await logUserAction('Enqueueing uploads from Tauri event', { pathCount: paths.length, targetPath: store.currentPath })
            store.enqueueUploadsFromPaths(paths, store.currentPath)
          }
          // Reset suppress flag after a longer delay to ensure DOM events are blocked
          setTimeout(async () => {
            suppressDomDropRef.current = false
            await logUserAction('Drop suppress flag reset', { source: 'tauri-event' })
          }, 200)
        })
        unlistenCancel = await listen('tauri://file-drop-cancelled', async () => {
          await logUserAction('File drop cancelled (Tauri)', { source: 'tauri-event' })
          setShowDropOverlay(false)
          suppressDomDropRef.current = false
        })

        await logUserAction('Tauri file drop event listeners registered successfully', { source: 'listener-setup' })
      } catch (_err) {
        // ignore if not in Tauri
        await logUserAction('Tauri file drop events not available', { mode: 'browser' })
        listenersRegisteredRef.current = false
      }
    })()

    return () => {
      // Don't reset the flag - let it stay registered for component lifetime
      // Only unlisten to clean up the actual event handlers
      logUserAction('Cleaning up Tauri file drop event listeners', { source: 'listener-cleanup' })
      try {
        if (unlistenHover) {
          unlistenHover()
        }
      } catch {
        // ignore cleanup errors
      }
      try {
        if (unlistenDrop) {
          unlistenDrop()
        }
      } catch {
        // ignore cleanup errors
      }
      try {
        if (unlistenCancel) {
          unlistenCancel()
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }, [])

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

  const handleRefresh = () => {
    loadFiles(currentPath)
  }

  const handleFilesMove = async (_files: FileItem[], _targetPath: string) => {
    await logUserAction('Move files', { fileCount: _files.length, targetPath: _targetPath })

    try {
      for (const file of _files) {
        // Calculate the new key
        const fileName = file.name
        const newKey = _targetPath ? `${_targetPath}/${fileName}` : fileName

        if (file.type === 'file') {
          await useAppStore.getState().moveObject(file.key, newKey)
        } else {
          // For folders, we need to move all contents
          // This is a simplified version - in production you'd want to handle this recursively
          await logUserAction('Folder move not fully implemented', { folderKey: file.key })
        }
      }

      await loadFiles(currentPath)
      await logUserAction('Files moved', { fileCount: _files.length })
    } catch (error) {
      await logUserAction('Move failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleFilesDrop = async (_files: File[], _targetPath: string) => {
    await logUserAction('DOM handleFilesDrop called', {
      fileCount: _files.length,
      targetPath: _targetPath,
      suppressFlag: suppressDomDropRef.current
    })
    const path = _targetPath && _targetPath.endsWith('/') ? _targetPath.replace(/\/$/, '') : currentPath
    await logUserAction('Normalized target path for drop', { normalizedPath: path })
    await enqueueUploads(_files, path)
  }

  const handleDownload = async (_files: FileItem[]) => {
    await logUserAction('Download files', { fileCount: _files.length })

    try {
      // Download each file
      for (const file of _files) {
        if (file.type === 'file') {
          // Ask user where to save the file
          const savePath = await save({
            defaultPath: file.name,
            filters: [{
              name: 'All Files',
              extensions: ['*']
            }]
          })

          if (savePath) {
            await useAppStore.getState().downloadFile(file.key, savePath)
            await logUserAction('File downloaded', { fileName: file.name, savePath })
          }
        }
      }
    } catch (error) {
      await logUserAction('Download failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleRename = async (file: FileItem) => {
    await logUserAction('Rename file', { fileName: file.name })
    setRenameFile(file)
    setShowRenameDialog(true)
  }

  const handleRenameConfirm = async (newName: string) => {
    if (!renameFile) return

    try {
      // Get the folder path from the current key
      const pathParts = renameFile.key.split('/')
      pathParts.pop() // Remove old filename
      const folderPath = pathParts.join('/')
      const newKey = folderPath ? `${folderPath}/${newName}` : newName

      // Use moveObject to rename (move to new key)
      await useAppStore.getState().moveObject(renameFile.key, newKey)
      await loadFiles(currentPath)
      await logUserAction('File renamed', { oldName: renameFile.name, newName })
    } catch (error) {
      await logUserAction('Rename failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handleDelete = async (_files: FileItem[]) => {
    await logUserAction('Delete files requested', { fileCount: _files.length })
    setFilesToDelete(_files)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    try {
      const fileKeys = filesToDelete.filter(f => f.type === 'file').map(f => f.key)
      const folderKeys = filesToDelete.filter(f => f.type === 'folder').map(f => f.key)

      // Delete files by setting them as selected and calling deleteSelectedFiles
      if (fileKeys.length > 0) {
        useAppStore.getState().selectFiles(fileKeys)
        await useAppStore.getState().deleteSelectedFiles()
      }

      // Delete folders
      for (const folderKey of folderKeys) {
        await useAppStore.getState().deleteFolder(folderKey)
      }

      // Clear selection
      useAppStore.getState().clearSelection()

      await loadFiles(currentPath)
      await logUserAction('Files deleted', { fileCount: filesToDelete.length })
    } catch (error) {
      await logUserAction('Delete failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handlePreview = async (file: FileItem) => {
    if (file.type === 'file') {
      setPreviewFile(file)
      setShowPreviewDialog(true)
    }
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
      <header className="border-b border-border bg-card">
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
                  <Icons.clipboard className="h-4 w-4" />
                  {activeUploadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-4 min-w-[16px] px-1 text-[10px] leading-none flex items-center justify-center">
                      {activeUploadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content sideOffset={6} className="z-50 min-w-[340px] border border-border bg-background rounded-md p-0 shadow-lg">
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
                        <div key={u.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate max-w-[180px]" title={u.name}>{u.name}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{u.progress}%</span>

                              {/* Action buttons based on status */}
                              {u.status === 'uploading' && (
                                <button
                                  className="text-muted-foreground hover:text-foreground p-1"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    await useAppStore.getState().pauseUpload(u.id)
                                  }}
                                  title="Pause"
                                >
                                  <Icons.pause className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {(u.status === 'error' && u.error?.includes('Paused')) && (
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

                              {(u.status === 'error' && !u.error?.includes('Paused')) && (
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

                              {(u.status === 'uploading' || u.status === 'pending' || u.status === 'error') && (
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
                              <Icons.error className="h-3.5 w-3.5 mr-1" />
                              <span className="truncate" title={u.error || 'Upload failed'}>
                                {u.error || 'Upload failed'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="capitalize">{u.status}</span>
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

            <Button variant="ghost" size="sm" className="h-8 px-2" title="Settings" onClick={() => setShowSettingsDialog(true)}>
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
        onDragEnter={async (e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
            dragCounter.current += 1
            await logUserAction('DOM drag enter', { dragCounter: dragCounter.current })
            setShowDropOverlay(true)
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
          }
        }}
        onDragLeave={async (e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault()
            dragCounter.current = Math.max(0, dragCounter.current - 1)
            await logUserAction('DOM drag leave', { dragCounter: dragCounter.current })
            if (dragCounter.current === 0) setShowDropOverlay(false)
          }
        }}
        onDrop={async (e) => {
          if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            e.preventDefault()
            dragCounter.current = 0
            setShowDropOverlay(false)
            await logUserAction('DOM drop event', {
              fileCount: e.dataTransfer.files.length,
              suppressFlag: suppressDomDropRef.current
            })
            if (!suppressDomDropRef.current) {
              const files = Array.from(e.dataTransfer.files)
              await logUserAction('Processing DOM drop (not suppressed)', { fileCount: files.length })
              handleFilesDrop(files, currentPath)
            } else {
              await logUserAction('DOM drop suppressed', { reason: 'Tauri event will handle it' })
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
          suppressDrop={suppressDomDropRef.current}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onRename={handleRename}
          onDelete={handleDelete}
          onCreateFolder={handleCreateFolder}
          onUpload={handleUpload}
          onRefresh={handleRefresh}
          isLoading={isLoading}
          searchQuery={searchQuery}
        />
      </main>

      {/* Status Bar */}
      <footer className="border-t border-border bg-muted/30 px-3 py-1.5">
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

      {/* Rename Dialog */}
      <RenameDialog
        file={renameFile}
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        onRename={handleRenameConfirm}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        files={filesToDelete}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteConfirm}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
      />
    </div>
  )
}
