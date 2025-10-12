import React from 'react'
import { Icons } from '@/components/ui/icons'
import { FileItem } from '@/types'
import { VirtualFileList } from './VirtualFileList'
import { FileContextMenu } from './FileContextMenu'
import { useDragAndDrop } from '@/hooks/use-drag-and-drop'
import { format } from 'date-fns'
import { getFileTypeLabel } from '@/lib/file'

interface FileListProps {
  files: FileItem[]
  viewMode: 'list' | 'grid'
  selectedFiles: string[]
  onFileClick: (file: FileItem, e: React.MouseEvent) => void
  onFileDoubleClick: (file: FileItem) => void
  onFileSelect: (key: string, selected: boolean) => void
  onFilesMove?: (files: FileItem[], targetPath: string) => void
  onFilesDrop?: (files: File[], targetPath: string) => void
  onPreview?: (file: FileItem) => void
  onDownload?: (files: FileItem[]) => void
  onRename?: (file: FileItem) => void
  onDelete?: (files: FileItem[]) => void
  onCopy?: (files: FileItem[]) => void
  onCut?: (files: FileItem[]) => void
  onPaste?: () => void
  hasClipboardContent?: boolean
  onCreateFolder?: () => void
  onUpload?: () => void
  onRefresh?: () => void
  isLoading?: boolean
  suppressDrop?: boolean
  searchQuery?: string
}

export function FileList({
  files,
  viewMode,
  selectedFiles,
  onFileClick,
  onFileDoubleClick,
  onFileSelect,
  onFilesMove,
  onFilesDrop,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  hasClipboardContent = false,
  onCreateFolder,
  onUpload,
  onRefresh,
  isLoading = false,
  suppressDrop = false,
  searchQuery = '',
}: FileListProps) {
  const { getDragProps, getDraggableProps, isDropTarget, isDraggedFile } = useDragAndDrop({
    onFilesMove,
    onFilesDrop: suppressDrop ? undefined : onFilesDrop,
  })

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'folder') {
      return <Icons.folder className="h-5 w-5 text-muted-foreground" />
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    switch (extension) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return <Icons.image className="h-5 w-5 text-green-600" />
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
      case 'flv':
        return <Icons.video className="h-5 w-5 text-purple-600" />
      case 'mp3':
      case 'wav':
      case 'flac':
      case 'aac':
        return <Icons.music className="h-5 w-5 text-orange-600" />
      case 'txt':
      case 'md':
      case 'json':
      case 'xml':
      case 'csv':
        return <Icons.fileText className="h-5 w-5 text-zinc-600" />
      default:
        return <Icons.file className="h-5 w-5 text-zinc-600" />
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const getSelectedFiles = (): FileItem[] => {
    return files.filter(file => selectedFiles.includes(file.key))
  }

  // Handle right-click to select file (Windows Explorer behavior)
  const handleContextMenu = (file: FileItem, e: React.MouseEvent) => {
    // Don't prevent default - let the ContextMenu component handle it
    // If right-clicked file is not in current selection, select only it
    if (!selectedFiles.includes(file.key)) {
      onFileClick(file, e)
    }
    // If it's already selected (including multi-selection), keep the selection
  }

  if (isLoading) {
    return (
      <div className="h-full grid place-items-center select-none">
        <div className="text-center">
          <Icons.loading className="h-6 w-6 animate-spin mx-auto mb-2 opacity-70" />
          <p className="text-sm text-muted-foreground">Loading files...</p>
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    const isSearching = searchQuery.trim().length > 0

    return (
      <FileContextMenu
        selectedFiles={selectedFiles}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        hasClipboardContent={hasClipboardContent}
        onCreateFolder={onCreateFolder}
        onUpload={onUpload}
        onRefresh={onRefresh}
      >
        <div
          className="flex items-center justify-center py-12 h-full select-none"
          {...getDragProps('')}
        >
          <div className="text-center">
            {isSearching ? (
              <>
                <Icons.search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground font-medium">No results found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  No files match "{searchQuery}"
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your search query
                </p>
              </>
            ) : (
              <>
                <Icons.folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground font-medium">This folder is empty</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Right-click to upload files or create folders
                </p>
              </>
            )}
          </div>
        </div>
      </FileContextMenu>
    )
  }

  if (viewMode === 'grid') {
    return (
      <FileContextMenu
        selectedFiles={selectedFiles}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        hasClipboardContent={hasClipboardContent}
        onCreateFolder={onCreateFolder}
        onUpload={onUpload}
        onRefresh={onRefresh}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4 h-full min-h-full overflow-auto" {...getDragProps('')}>
          {files.map((file) => {
            const isSelected = selectedFiles.includes(file.key)
            const isDragged = isDraggedFile(file)
            const isTarget = file.type === 'folder' && isDropTarget(file.key)

            return (
              <FileContextMenu
                key={file.key}
                file={file}
                selectedFiles={selectedFiles}
                onOpen={onFileDoubleClick}
                onPreview={onPreview}
                onDownload={onDownload}
                onRename={onRename}
                onDelete={onDelete}
                onCopy={onCopy}
                onCut={onCut}
                onPaste={onPaste}
                hasClipboardContent={hasClipboardContent}
                onCreateFolder={onCreateFolder}
                onUpload={onUpload}
                onRefresh={onRefresh}
              >
                <div
                  data-file-item
                  className={`group relative p-3 rounded-lg border hover:bg-accent cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md select-none ${
                    isSelected ? 'bg-accent border-primary shadow-md' : 'border-border'
                  } ${isDragged ? 'opacity-50' : ''} ${
                    isTarget ? 'border-primary bg-primary/10 shadow-md' : ''
                  }`}
                  onClick={(e) => onFileClick(file, e)}
                  onDoubleClick={() => onFileDoubleClick(file)}
                  onContextMenu={(e) => handleContextMenu(file, e)}
                  {...getDraggableProps(isSelected ? getSelectedFiles() : [file])}
                  {...(file.type === 'folder' ? getDragProps(file.key) : {})}
                >
                  <div className="flex flex-col items-center text-center space-y-2">
                    {getFileIcon(file)}
                    <span className="text-sm font-medium truncate w-full">
                      {file.name}
                    </span>
                    {file.type === 'file' && (
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                    )}
                  </div>
                </div>
              </FileContextMenu>
            )
          })}
        </div>
      </FileContextMenu>
    )
  }

  // Use virtual scrolling for list view when there are many files
  if (files.length > 100) {
    return (
      <VirtualFileList
        files={files}
        selectedFiles={selectedFiles}
        onFileClick={onFileClick}
        onFileDoubleClick={onFileDoubleClick}
        onFileSelect={onFileSelect}
        isLoading={isLoading}
        onFilesDrop={onFilesDrop}
        suppressDrop={suppressDrop}
        searchQuery={searchQuery}
      />
    )
  }

  return (
    <FileContextMenu
      selectedFiles={selectedFiles}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
      hasClipboardContent={hasClipboardContent}
      onCreateFolder={onCreateFolder}
      onUpload={onUpload}
      onRefresh={onRefresh}
    >
      <div className="divide-y divide-border h-full flex flex-col overflow-hidden" {...getDragProps('')}>
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 pl-6 pr-3 py-3 text-sm font-medium text-muted-foreground bg-muted/30 select-none flex-shrink-0">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Modified</div>
        </div>

        {/* File rows - scrollable */}
        <div className="flex-1 overflow-auto divide-y divide-border">
          {files.map((file) => {
            const isSelected = selectedFiles.includes(file.key)
            const isDragged = isDraggedFile(file)
            const isTarget = file.type === 'folder' && isDropTarget(file.key)

            return (
              <FileContextMenu
                key={file.key}
                file={file}
                selectedFiles={selectedFiles}
                onOpen={onFileDoubleClick}
                onPreview={onPreview}
                onDownload={onDownload}
                onRename={onRename}
                onDelete={onDelete}
                onCopy={onCopy}
                onCut={onCut}
                onPaste={onPaste}
                hasClipboardContent={hasClipboardContent}
                onCreateFolder={onCreateFolder}
                onUpload={onUpload}
                onRefresh={onRefresh}
              >
                <div
                  data-file-item
                  className={`grid grid-cols-12 gap-4 pl-6 pr-3 py-3 hover:bg-accent cursor-pointer transition-colors group select-none ${
                    isSelected ? 'bg-accent' : ''
                  } ${isDragged ? 'opacity-50' : ''} ${
                    isTarget ? 'bg-primary/10 border-l-2 border-primary' : ''
                  }`}
                  onClick={(e) => onFileClick(file, e)}
                  onDoubleClick={() => onFileDoubleClick(file)}
                  onContextMenu={(e) => handleContextMenu(file, e)}
                  {...getDraggableProps(isSelected ? getSelectedFiles() : [file])}
                  {...(file.type === 'folder' ? getDragProps(file.key) : {})}
                >
                  <div className="col-span-6 flex items-center space-x-3 min-w-0">
                    {getFileIcon(file)}
                    <span className="font-medium truncate">{file.name}</span>
                  </div>

                  <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                    {file.type === 'file' ? formatFileSize(file.size) : '-'}
                  </div>

                  <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                    {file.type === 'file' ? getFileTypeLabel(file.name, file.contentType) : 'Folder'}
                  </div>

                  <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                    {file.lastModified ? format(file.lastModified, 'MMM d, yyyy HH:mm') : '-'}
                  </div>
                </div>
              </FileContextMenu>
            )
          })}
        </div>
      </div>
    </FileContextMenu>
  )
}
