import React, { useMemo } from 'react'
import { FixedSizeList as List } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { Icons } from '@/components/ui/icons'
import { FileItem } from '@/types'
import { format } from 'date-fns'

interface VirtualFileListProps {
  files: FileItem[]
  selectedFiles: string[]
  onFileClick: (file: FileItem, e: React.MouseEvent) => void
  onFileDoubleClick: (file: FileItem) => void
  onFileSelect: (key: string, selected: boolean) => void
  isLoading?: boolean
  onFilesDrop?: (files: File[], targetPath: string) => void
  suppressDrop?: boolean
}

interface FileRowProps {
  index: number
  style: React.CSSProperties
  data: {
    files: FileItem[]
    selectedFiles: string[]
    onFileClick: (file: FileItem, e: React.MouseEvent) => void
    onFileDoubleClick: (file: FileItem) => void
    onFileSelect: (key: string, selected: boolean) => void
  }
}

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

const FileRow: React.FC<FileRowProps> = ({ index, style, data }) => {
  const { files, selectedFiles, onFileClick, onFileDoubleClick } = data
  const file = files[index]

  if (!file) return null

  const isSelected = selectedFiles.includes(file.key)

  return (
    <div
      style={style}
      className={`grid grid-cols-12 gap-4 pl-6 pr-4 hover:bg-accent cursor-pointer transition-colors group border-b border-border/50 ${
        isSelected ? 'bg-accent' : ''
      }`}
      onClick={(e) => onFileClick(file, e)}
      onDoubleClick={() => onFileDoubleClick(file)}
    >
      <div className="col-span-6 flex items-center space-x-3 min-w-0">
        {getFileIcon(file)}
        <span className="font-medium truncate">{file.name}</span>
      </div>

      <div className="col-span-2 flex items-center text-sm text-muted-foreground">
        {file.type === 'file' ? formatFileSize(file.size) : '-'}
      </div>

      <div className="col-span-2 flex items-center text-sm text-muted-foreground">
        {file.type === 'file' ? file.contentType || 'Unknown' : 'Folder'}
      </div>

      <div className="col-span-2 flex items-center text-sm text-muted-foreground">
        {file.lastModified ? format(file.lastModified, 'MMM d, yyyy HH:mm') : '-'}
      </div>
    </div>
  )
}

export function VirtualFileList({
  files,
  selectedFiles,
  onFileClick,
  onFileDoubleClick,
  onFileSelect,
  isLoading = false,
  onFilesDrop,
  suppressDrop = false,
}: VirtualFileListProps) {
  const itemData = useMemo(
    () => ({
      files,
      selectedFiles,
      onFileClick,
      onFileDoubleClick,
      onFileSelect,
    }),
    [files, selectedFiles, onFileClick, onFileDoubleClick, onFileSelect]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Icons.loading className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading files...</p>
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Icons.folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">This folder is empty</p>
        </div>
      </div>
    )
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      if (!suppressDrop) {
        const files = Array.from(e.dataTransfer.files)
        onFilesDrop?.(files, '')
      }
    }
  }

  return (
    <div className="h-full flex flex-col" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 p-3 text-sm font-medium text-muted-foreground bg-muted/30 border-b">
        <div className="col-span-6">Name</div>
        <div className="col-span-2">Size</div>
        <div className="col-span-2">Type</div>
        <div className="col-span-2">Modified</div>
      </div>

      {/* Virtual List */}
      <div className="flex-1">
        <AutoSizer>
          {({ height, width }) => (
            <List
              height={height}
              width={width}
              itemCount={files.length}
              itemSize={56} // Height of each row
              itemData={itemData}
            >
              {FileRow}
            </List>
          )}
        </AutoSizer>
      </div>
    </div>
  )
}
