import React from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Icons } from '@/components/ui/icons'
import { FileItem } from '@/types'

interface FileContextMenuProps {
  children: React.ReactNode
  file?: FileItem
  selectedFiles: string[]
  onOpen?: (file: FileItem) => void
  onPreview?: (file: FileItem) => void
  onDownload?: (files: FileItem[]) => void
  onRename?: (file: FileItem) => void
  onDelete?: (files: FileItem[]) => void
  onCopy?: (files: FileItem[]) => void
  onCut?: (files: FileItem[]) => void
  onPaste?: () => void
  onProperties?: (file: FileItem) => void
  onCreateFolder?: () => void
  onUpload?: () => void
  onRefresh?: () => void
}

export function FileContextMenu({
  children,
  file,
  selectedFiles,
  onOpen,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onProperties,
  onCreateFolder,
  onUpload,
  onRefresh,
}: FileContextMenuProps) {
  const isMultipleSelected = selectedFiles.length > 1
  const isFileSelected = file && selectedFiles.includes(file.key)

  // Get files to operate on (either selected files or the right-clicked file)
  const getTargetFiles = (): FileItem[] => {
    if (file && isFileSelected) {
      // If the right-clicked file is in selection, operate on all selected files
      return [] // We'll need to get actual file objects from store
    } else if (file) {
      // If right-clicked file is not selected, operate only on it
      return [file]
    }
    return []
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {file ? (
          // File/Folder context menu
          <>
            <ContextMenuItem
              onClick={() => file && onOpen?.(file)}
              disabled={file?.type !== 'folder'}
            >
              <Icons.folderOpen className="mr-2 h-4 w-4" />
              Open
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => file && onPreview?.(file)}
              disabled={file?.type !== 'file' || isMultipleSelected}
            >
              <Icons.eye className="mr-2 h-4 w-4" />
              Preview
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={onCreateFolder}>
              <Icons.folder className="mr-2 h-4 w-4" />
              New Folder
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={() => {
                const files = getTargetFiles()
                if (files.length > 0) onDownload?.(files)
              }}
            >
              <Icons.download className="mr-2 h-4 w-4" />
              Download
              {isMultipleSelected && ` (${selectedFiles.length} items)`}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={() => {
                const files = getTargetFiles()
                if (files.length > 0) onCopy?.(files)
              }}
            >
              <Icons.copy className="mr-2 h-4 w-4" />
              Copy
              {isMultipleSelected && ` (${selectedFiles.length} items)`}
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => {
                const files = getTargetFiles()
                if (files.length > 0) onCut?.(files)
              }}
            >
              <Icons.move className="mr-2 h-4 w-4" />
              Cut
              {isMultipleSelected && ` (${selectedFiles.length} items)`}
            </ContextMenuItem>

            <ContextMenuItem
              onClick={onPaste}
              disabled={true} // Enable when clipboard functionality is implemented
            >
              <Icons.plus className="mr-2 h-4 w-4" />
              Paste
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={() => file && onRename?.(file)}
              disabled={isMultipleSelected}
            >
              <Icons.edit className="mr-2 h-4 w-4" />
              Rename
            </ContextMenuItem>

            <ContextMenuItem
              onClick={() => {
                const files = getTargetFiles()
                if (files.length > 0) onDelete?.(files)
              }}
              className="text-destructive focus:text-destructive"
            >
              <Icons.delete className="mr-2 h-4 w-4" />
              Delete
              {isMultipleSelected && ` (${selectedFiles.length} items)`}
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Icons.moreHorizontal className="mr-2 h-4 w-4" />
                More Actions
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem
                  onClick={() => file && onProperties?.(file)}
                  disabled={isMultipleSelected}
                >
                  <Icons.info className="mr-2 h-4 w-4" />
                  Properties
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        ) : (
          // Empty space context menu
          <>
            <ContextMenuItem onClick={onUpload}>
              <Icons.upload className="mr-2 h-4 w-4" />
              Upload Files
            </ContextMenuItem>

            <ContextMenuItem onClick={onCreateFolder}>
              <Icons.folder className="mr-2 h-4 w-4" />
              New Folder
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={onPaste}
              disabled={true} // Enable when clipboard functionality is implemented
            >
              <Icons.plus className="mr-2 h-4 w-4" />
              Paste
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={onRefresh}>
              <Icons.refresh className="mr-2 h-4 w-4" />
              Refresh
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
