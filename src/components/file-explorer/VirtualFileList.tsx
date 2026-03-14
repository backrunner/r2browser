import { useMemo, type CSSProperties, type MouseEvent } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { format } from 'date-fns'
import { Icons } from '@/components/ui/icons'
import { FileItem } from '@/types'
import { getFileTypeLabel } from '@/lib/file'
import { FileContextMenu } from './FileContextMenu'
import { useDragAndDrop } from '@/hooks/use-drag-and-drop'

type DragPropsGetter = ReturnType<typeof useDragAndDrop>['getDragProps']
type DraggablePropsGetter = ReturnType<typeof useDragAndDrop>['getDraggableProps']

interface VirtualFileListProps {
  files: FileItem[]
  selectedFiles: string[]
  onFileClick: (file: FileItem, e: MouseEvent) => void
  onFileDoubleClick: (file: FileItem) => void
  onFileSelect: (key: string, selected: boolean) => void
  isLoading?: boolean
  onFilesMove?: (files: FileItem[], targetPath: string) => void
  onFilesDrop?: (files: File[], targetPath: string) => void
  onPreview?: (file: FileItem) => void
  onDownload?: (files: FileItem[]) => void
  onRename?: (file: FileItem) => void
  onDelete?: (files: FileItem[]) => void
  onCopy?: (files: FileItem[]) => void
  onCut?: (files: FileItem[]) => void
  onPaste?: (targetPath?: string) => void
  hasClipboardContent?: boolean
  onCreateFolder?: () => void
  onUpload?: () => void
  onRefresh?: () => void
  suppressDrop?: boolean
  searchQuery?: string
}

interface FileRowData {
  files: FileItem[]
  selectedFiles: string[]
  selectedFileObjects: FileItem[]
  onFileClick: (file: FileItem, e: MouseEvent) => void
  onFileDoubleClick: (file: FileItem) => void
  onPreview?: (file: FileItem) => void
  onDownload?: (files: FileItem[]) => void
  onRename?: (file: FileItem) => void
  onDelete?: (files: FileItem[]) => void
  onCopy?: (files: FileItem[]) => void
  onCut?: (files: FileItem[]) => void
  onPaste?: (targetPath?: string) => void
  hasClipboardContent: boolean
  onCreateFolder?: () => void
  onUpload?: () => void
  onRefresh?: () => void
  getDragProps: DragPropsGetter
  getDraggableProps: DraggablePropsGetter
  isDropTarget: (targetPath: string) => boolean
  isDraggedFile: (file: FileItem) => boolean
}

type FileRowProps = RowComponentProps<FileRowData>

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

const FileRow = ({
  ariaAttributes,
  index,
  style,
  files,
  selectedFiles,
  selectedFileObjects,
  onFileClick,
  onFileDoubleClick,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  hasClipboardContent,
  onCreateFolder,
  onUpload,
  onRefresh,
  getDragProps,
  getDraggableProps,
  isDropTarget,
  isDraggedFile,
}: FileRowProps) => {
  const file = files[index]

  if (!file) return null

  const isSelected = selectedFiles.includes(file.key)
  const isDragged = isDraggedFile(file)
  const isTarget = file.type === 'folder' && isDropTarget(file.key)

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!selectedFiles.includes(file.key)) {
      onFileClick(file, e)
    }
  }

  return (
    <FileContextMenu
      file={file}
      selectedFiles={selectedFiles}
      selectedFileObjects={selectedFileObjects}
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
        {...ariaAttributes}
        style={style}
        data-file-item
        className={`grid grid-cols-12 gap-4 pl-6 pr-4 hover:bg-accent cursor-pointer transition-colors group border-b border-border/50 select-none ${
          isSelected ? 'bg-accent' : ''
        } ${isDragged ? 'opacity-50' : ''} ${
          isTarget ? 'bg-primary/10 border-l-2 border-primary' : ''
        }`}
        onClick={(e) => onFileClick(file, e)}
        onDoubleClick={() => onFileDoubleClick(file)}
        onContextMenu={handleContextMenu}
        {...getDraggableProps(isSelected ? selectedFileObjects : [file])}
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
}

export function VirtualFileList({
  files,
  selectedFiles,
  onFileClick,
  onFileDoubleClick,
  onFileSelect,
  isLoading = false,
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
  suppressDrop = false,
  searchQuery = '',
}: VirtualFileListProps) {
  const { getDragProps, getDraggableProps, isDropTarget, isDraggedFile } = useDragAndDrop({
    onFilesMove,
    onFilesDrop: suppressDrop ? undefined : onFilesDrop,
  })

  const selectedFileObjects = useMemo(
    () => files.filter((file) => selectedFiles.includes(file.key)),
    [files, selectedFiles]
  )

  const itemData = useMemo(
    () => ({
      files,
      selectedFiles,
      selectedFileObjects,
      onFileClick,
      onFileDoubleClick,
      onFileSelect,
      onPreview,
      onDownload,
      onRename,
      onDelete,
      onCopy,
      onCut,
      onPaste,
      hasClipboardContent,
      onCreateFolder,
      onUpload,
      onRefresh,
      getDragProps,
      getDraggableProps,
      isDropTarget,
      isDraggedFile,
    }),
    [
      files,
      selectedFiles,
      selectedFileObjects,
      onFileClick,
      onFileDoubleClick,
      onFileSelect,
      onPreview,
      onDownload,
      onRename,
      onDelete,
      onCopy,
      onCut,
      onPaste,
      hasClipboardContent,
      onCreateFolder,
      onUpload,
      onRefresh,
      getDragProps,
      getDraggableProps,
      isDropTarget,
      isDraggedFile,
    ]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 select-none">
        <div className="text-center">
          <Icons.loading className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading files...</p>
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
        <div className="flex items-center justify-center py-12 h-full select-none" {...getDragProps('')}>
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
      <div className="h-full flex flex-col" {...getDragProps('')}>
        <div className="grid grid-cols-12 gap-4 p-3 text-sm font-medium text-muted-foreground bg-muted/30 border-b select-none">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Modified</div>
        </div>

        <div className="flex-1">
          <AutoSizer
            renderProp={({ height = 0, width = 0 }) => (
              <List
                defaultHeight={height}
                rowCount={files.length}
                rowHeight={56}
                rowProps={itemData}
                rowComponent={FileRow}
                style={{ height, width } satisfies CSSProperties}
              />
            )}
          />
        </div>
      </div>
    </FileContextMenu>
  )
}
