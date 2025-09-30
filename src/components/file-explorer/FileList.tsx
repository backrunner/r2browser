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
  onDownload?: (files: FileItem[]) => void
  onRename?: (file: FileItem) => void
  onDelete?: (files: FileItem[]) => void
  onCreateFolder?: () => void
  onUpload?: () => void
  onRefresh?: () => void
  isLoading?: boolean
  suppressDrop?: boolean
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
  onDownload,
  onRename,
  onDelete,
  onCreateFolder,
  onUpload,
  onRefresh,
  isLoading = false,
  suppressDrop = false,
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

  if (isLoading) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center">
          <Icons.loading className="h-6 w-6 animate-spin mx-auto mb-2 opacity-70" />
          <p className="text-sm text-muted-foreground">Loading files...</p>
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <FileContextMenu
        selectedFiles={selectedFiles}
        onCreateFolder={onCreateFolder}
        onUpload={onUpload}
        onRefresh={onRefresh}
      >
        <div
          className="flex items-center justify-center py-12 h-full"
          {...getDragProps('')}
        >
          <div className="text-center">
            <Icons.folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">This folder is empty</p>
            <p className="text-sm text-muted-foreground mt-2">
              Right-click to upload files or create folders
            </p>
          </div>
        </div>
      </FileContextMenu>
    )
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4" {...getDragProps('')}>
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
              onDownload={onDownload}
              onRename={onRename}
              onDelete={onDelete}
            >
              <div
                className={`group relative p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors ${
                  isSelected ? 'bg-accent border-primary' : ''
                } ${isDragged ? 'opacity-50' : ''} ${
                  isTarget ? 'border-primary bg-primary/10' : ''
                }`}
                onClick={(e) => onFileClick(file, e)}
                onDoubleClick={() => onFileDoubleClick(file)}
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
      />
    )
  }

  return (
    <div className="divide-y" {...getDragProps('')}>
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 pl-6 pr-3 py-3 text-sm font-medium text-muted-foreground bg-muted/30">
        <div className="col-span-6">Name</div>
        <div className="col-span-2">Size</div>
        <div className="col-span-2">Type</div>
        <div className="col-span-2">Modified</div>
      </div>

      {/* File rows */}
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
            onDownload={onDownload}
            onRename={onRename}
            onDelete={onDelete}
          >
            <div
              className={`grid grid-cols-12 gap-4 pl-6 pr-3 py-3 hover:bg-accent cursor-pointer transition-colors group ${
                isSelected ? 'bg-accent' : ''
              } ${isDragged ? 'opacity-50' : ''} ${
                isTarget ? 'bg-primary/10 border-l-2 border-primary' : ''
              }`}
              onClick={(e) => onFileClick(file, e)}
              onDoubleClick={() => onFileDoubleClick(file)}
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
  )
}
