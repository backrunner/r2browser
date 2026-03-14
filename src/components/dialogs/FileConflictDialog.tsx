import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Checkbox } from '@/components/ui/checkbox'
import { formatFileSize, formatDate } from '@/lib/file'

export type ConflictResolution = 'skip' | 'overwrite' | 'rename' | 'cancel'

export interface FileConflict {
  sourceFile: {
    name: string
    size?: number
    lastModified?: Date
  }
  existingFile: {
    name: string
    size?: number
    lastModified?: Date
  }
  suggestedName: string
}

interface FileConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: FileConflict[]
  currentIndex: number
  onResolve: (resolution: ConflictResolution, applyToAll: boolean) => void
}

export function FileConflictDialog({
  open,
  onOpenChange,
  conflicts,
  currentIndex,
  onResolve,
}: FileConflictDialogProps) {
  const [applyToAll, setApplyToAll] = useState(false)

  const conflict = conflicts[currentIndex]
  const hasMultiple = conflicts.length > 1
  const remaining = conflicts.length - currentIndex

  if (!conflict) return null

  const handleResolve = (resolution: ConflictResolution) => {
    onResolve(resolution, applyToAll)
    // Reset applyToAll when dialog will close (cancel or apply to all)
    if (resolution === 'cancel' || applyToAll) {
      setApplyToAll(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 select-none">
            <Icons.warning className="h-5 w-5 text-amber-500" />
            File Already Exists
          </DialogTitle>
          <DialogDescription className="pt-2 select-none">
            {hasMultiple && (
              <span className="text-xs text-muted-foreground mb-2 block">
                Conflict {currentIndex + 1} of {conflicts.length} ({remaining} remaining)
              </span>
            )}
            A file with the name <strong>{conflict.existingFile.name}</strong> already exists in this location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Existing file info */}
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground mb-2">Existing file</div>
            <div className="flex items-start gap-3">
              <Icons.file className="h-8 w-8 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{conflict.existingFile.name}</div>
                <div className="text-xs text-muted-foreground mt-1 space-x-3">
                  {conflict.existingFile.size !== undefined && (
                    <span>{formatFileSize(conflict.existingFile.size)}</span>
                  )}
                  {conflict.existingFile.lastModified && (
                    <span>{formatDate(conflict.existingFile.lastModified)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Source file info */}
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground mb-2">File to upload</div>
            <div className="flex items-start gap-3">
              <Icons.upload className="h-8 w-8 text-primary flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{conflict.sourceFile.name}</div>
                <div className="text-xs text-muted-foreground mt-1 space-x-3">
                  {conflict.sourceFile.size !== undefined && (
                    <span>{formatFileSize(conflict.sourceFile.size)}</span>
                  )}
                  {conflict.sourceFile.lastModified && (
                    <span>{formatDate(conflict.sourceFile.lastModified)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Apply to all checkbox */}
          {hasMultiple && (
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="applyToAll"
                checked={applyToAll}
                onCheckedChange={(checked) => setApplyToAll(checked === true)}
              />
              <label
                htmlFor="applyToAll"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Apply to all {remaining} remaining conflicts
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleResolve('cancel')} className="sm:mr-auto">
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleResolve('skip')}>
              Skip
            </Button>
            <Button variant="outline" onClick={() => handleResolve('rename')}>
              Keep Both
            </Button>
            <Button variant="default" onClick={() => handleResolve('overwrite')}>
              Replace
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
