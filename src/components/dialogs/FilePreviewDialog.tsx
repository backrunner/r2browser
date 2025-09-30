import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { FileItem, FilePreview } from '@/types'
import { getFileTypeLabel } from '@/lib/file'
import { useAppStore } from '@/stores/app-store'

interface FilePreviewDialogProps {
  file: FileItem | null
  open: boolean
  onClose: () => void
}

export function FilePreviewDialog({ file, open, onClose }: FilePreviewDialogProps) {
  const { currentSession } = useAppStore()
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const getFileType = (file: FileItem): FilePreview['type'] => {
    if (!file.contentType) return 'unknown'

    if (file.contentType.startsWith('image/')) return 'image'
    if (file.contentType.startsWith('video/')) return 'video'
    if (file.contentType.startsWith('audio/')) return 'audio'
    if (file.contentType.startsWith('text/') || file.contentType === 'application/json') return 'text'
    if (file.contentType === 'application/pdf') return 'pdf'

    return 'unknown'
  }

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size'

    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const loadPreview = useCallback(async (file: FileItem) => {
    if (!currentSession) return

    setIsLoading(true)
    setPreview(null)

    try {
      const fileType = getFileType(file)

      // For now, just show file information
      // TODO: Implement actual file preview using Tauri backend
      setPreview({
        type: fileType,
        error: undefined,
      })
    } catch (_error) {
      setPreview({
        type: 'unknown',
        error: 'Failed to load preview',
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentSession])

  useEffect(() => {
    if (file && open) {
      loadPreview(file)
    }
  }, [file, open, loadPreview])

  if (!file) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Icons.file className="h-5 w-5" />
            <span>{file.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col space-y-4">
          {/* File Information */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Size:</strong> {formatFileSize(file.size)}
            </div>
            <div>
              <strong>Type:</strong> {getFileTypeLabel(file.name, file.contentType)}
            </div>
            <div>
              <strong>Last Modified:</strong> {file.lastModified?.toLocaleDateString() || 'Unknown'}
            </div>
            <div>
              <strong>Key:</strong> {file.key}
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 border rounded-lg p-4 min-h-[200px] flex items-center justify-center">
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <Icons.loading className="h-4 w-4 animate-spin" />
                <span>Loading preview...</span>
              </div>
            ) : preview?.error ? (
              <div className="text-center text-muted-foreground">
                <Icons.loading className="h-8 w-8 mx-auto mb-2" />
                <p>{preview.error}</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <Icons.eye className="h-8 w-8 mx-auto mb-2" />
                <p>File preview will be available in a future version</p>
                <p className="text-xs mt-1">Use download to view the file content</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}