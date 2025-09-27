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
import { Progress } from '@/components/ui/progress'
import { Icons } from '@/components/ui/icons'
import { UploadProgress } from '@/types'
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
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({})
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

    // Initialize progress for all files
    const initialProgress: Record<string, UploadProgress> = {}
    selectedFiles.forEach(file => {
      initialProgress[file.name] = {
        fileName: file.name,
        progress: 0,
        status: 'pending',
      }
    })
    setUploadProgress(initialProgress)

    try {
      // Simulate upload progress (in real implementation, this would be handled by the upload API)
      for (const file of selectedFiles) {
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { ...prev[file.name], status: 'uploading' },
        }))

        // Simulate progress updates
        for (let progress = 0; progress <= 100; progress += 10) {
          await new Promise(resolve => setTimeout(resolve, 100))
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: { ...prev[file.name], progress },
          }))
        }

        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { ...prev[file.name], status: 'completed' },
        }))
      }

      // Call the actual upload function
      await onUpload(selectedFiles, currentPath)

      // Reset state
      setSelectedFiles([])
      setUploadProgress({})
      onOpenChange(false)
    } catch (error) {
      await logError(error, 'Upload failed', 'file-upload-dialog')
      // Update failed files
      selectedFiles.forEach(file => {
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: {
            ...prev[file.name],
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed',
          },
        }))
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleCancel = () => {
    setSelectedFiles([])
    setUploadProgress({})
    setIsUploading(false)
    onOpenChange(false)
  }

  const totalFiles = selectedFiles.length
  const completedFiles = Object.values(uploadProgress).filter(p => p.status === 'completed').length

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
              {selectedFiles.map((file, index) => {
                const progress = uploadProgress[file.name]
                return (
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
                      {progress && (
                        <div className="mt-1">
                          <Progress value={progress.progress} className="h-1" />
                          <p className="text-xs text-muted-foreground mt-1">
                            {progress.status === 'uploading' && `${progress.progress}%`}
                            {progress.status === 'completed' && (
                              <span className="text-green-600">Completed</span>
                            )}
                            {progress.status === 'error' && (
                              <span className="text-red-600">
                                Error: {progress.error}
                              </span>
                            )}
                          </p>
                        </div>
                      )}
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
                )
              })}
            </div>
          )}

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Progress: {completedFiles} of {totalFiles} files uploaded
                </span>
                <span>{Math.round((completedFiles / totalFiles) * 100)}%</span>
              </div>
              <Progress value={(completedFiles / totalFiles) * 100} />
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