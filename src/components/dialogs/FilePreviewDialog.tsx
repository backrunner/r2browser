import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { FileItem, FilePreview, PresignedUrlResponse } from '@/types'
import { getFileTypeLabel } from '@/lib/file'
import {
  getPreviewType,
  isPreviewable,
  isFileSizePreviewable,
  formatFileSize
} from '@/lib/preview'
import { useAppStore } from '@/stores/app-store'
import { ImagePreview } from './previews/ImagePreview'
import { TextPreview } from './previews/TextPreview'
import { PDFPreview } from './previews/PDFPreview'
import { MediaPreview } from './previews/MediaPreview'

interface FilePreviewDialogProps {
  file: FileItem | null
  open: boolean
  onClose: () => void
}

export function FilePreviewDialog({ file, open, onClose }: FilePreviewDialogProps) {
  const { currentSession } = useAppStore()
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const loadPreview = useCallback(async (file: FileItem) => {
    if (!currentSession) return

    setIsLoading(true)
    setPreview(null)
    setPreviewUrl(null)

    try {
      const previewType = getPreviewType(file)

      // Check if file is previewable
      if (!isPreviewable(file)) {
        setPreview({
          type: 'unknown',
          error: 'This file type cannot be previewed',
        })
        setIsLoading(false)
        return
      }

      // Check file size
      if (!isFileSizePreviewable(file)) {
        setPreview({
          type: previewType,
          error: 'File is too large to preview',
        })
        setIsLoading(false)
        return
      }

      // Generate presigned URL for the file
      const response = await invoke<PresignedUrlResponse>('generate_presigned_url', {
        sessionId: currentSession.id,
        key: file.key,
        method: 'GET',
        expiresIn: 3600, // 1 hour
      })

      const url = response.url

      // For text files, fetch the content
      if (previewType === 'text') {
        const textResponse = await fetch(url)
        if (!textResponse.ok) {
          throw new Error('Failed to fetch file content')
        }
        const content = await textResponse.text()

        setPreview({
          type: 'text',
          content,
        })
      } else {
        // For other types, just provide the URL
        setPreviewUrl(url)
        setPreview({
          type: previewType,
          url,
        })
      }
    } catch (error) {
      console.error('Failed to load preview:', error)
      setPreview({
        type: 'unknown',
        error: `Failed to load preview: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentSession])

  useEffect(() => {
    if (file && open) {
      loadPreview(file)
    } else {
      // Clean up when dialog is closed
      setPreview(null)
      setPreviewUrl(null)
    }
  }, [file, open, loadPreview])

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!file) return null

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="text-center">
            <Icons.loading className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      )
    }

    if (preview?.error) {
      return (
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="text-center">
            <Icons.warning className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{preview.error}</p>
          </div>
        </div>
      )
    }

    if (!preview) return null

    switch (preview.type) {
      case 'image':
        return previewUrl ? (
          <ImagePreview url={previewUrl} fileName={file.name} />
        ) : null

      case 'text':
        return preview.content ? (
          <TextPreview content={preview.content} fileName={file.name} />
        ) : null

      case 'pdf':
        return previewUrl ? (
          <PDFPreview url={previewUrl} fileName={file.name} />
        ) : null

      case 'video':
        return previewUrl ? (
          <MediaPreview url={previewUrl} fileName={file.name} type="video" />
        ) : null

      case 'audio':
        return previewUrl ? (
          <MediaPreview url={previewUrl} fileName={file.name} type="audio" />
        ) : null

      default:
        return (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center">
              <Icons.eye className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type
              </p>
            </div>
          </div>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 leading-normal py-1">
            <Icons.file className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">{file.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col space-y-4 flex-1 overflow-hidden">
          {/* File Information */}
          <div className="grid grid-cols-2 gap-3 text-sm border border-border rounded-lg p-4 bg-card shadow-sm">
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</span>
              <span className="font-medium">{formatFileSize(file.size)}</span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</span>
              <span className="font-medium">{getFileTypeLabel(file.name, file.contentType)}</span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Modified</span>
              <span className="font-medium">
                {file.lastModified?.toLocaleDateString() || 'Unknown'}
              </span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key</span>
              <span className="font-medium truncate" title={file.key}>{file.key}</span>
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 overflow-hidden min-h-0">
            {renderPreview()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
