import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { logError } from '../../lib/logger'

interface FileUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPath: string
  onUpload: (files: File[], path: string) => Promise<void>
}

export function FileUploadDialog({
  open,
  onOpenChange,
  currentPath,
  onUpload,
}: FileUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setSelectedFiles(prev => [...prev, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  })

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return

    setIsUploading(true)

    try {
      // Call the actual upload function - progress will be tracked by app store
      await onUpload(selectedFiles, currentPath)

      // Reset state on success
      setSelectedFiles([])
      onOpenChange(false)
    } catch (error) {
      await logError(error, 'Upload failed', 'file-upload-dialog')
      // Keep dialog open on error so user can retry
    } finally {
      setIsUploading(false)
    }
  }

  const handleCancel = () => {
    setSelectedFiles([])
    setIsUploading(false)
    onOpenChange(false)
  }

  const totalFiles = selectedFiles.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Upload files to: /{currentPath || 'root'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isUploading && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
            >
              <input {...getInputProps()} />
              <Icons.upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p>Drop the files here...</p>
              ) : (
                <div>
                  <p className="text-lg font-medium">Drag & drop files here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to select files
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center space-x-3 p-2 border rounded"
                >
                  <Icons.file className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  {!isUploading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-8 w-8 p-0"
                    >
                      <Icons.x className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading {totalFiles} file{totalFiles !== 1 ? 's' : ''}...</span>
                <span className="text-muted-foreground">Check progress in upload queue</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Icons.loading className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Icons.upload className="h-4 w-4 mr-2" />
                Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}