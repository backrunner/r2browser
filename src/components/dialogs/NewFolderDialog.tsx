import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icons } from '@/components/ui/icons'

interface NewFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPath: string
  onCreate: (folderName: string) => Promise<void>
}

// Modal to create a new logical folder by uploading a placeholder object (".folder").
export function NewFolderDialog({ open, onOpenChange, currentPath, onCreate }: NewFolderDialogProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [open])

  const validationError = useMemo(() => {
    const trimmed = name.trim()
    if (!trimmed) return 'Folder name is required'
    if (trimmed === '.' || trimmed === '..' || trimmed === '.folder') return 'Invalid folder name'
    if (trimmed.includes('/')) return 'Folder name cannot contain slashes'
    if (trimmed.includes('\\')) return 'Folder name cannot contain backslashes'
    return null
  }, [name])

  const fullPathPreview = useMemo(() => {
    const base = currentPath ? (currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath) : ''
    const n = name.trim()
    if (!n) return base ? `${base}/` : '/'
    return `${base ? `/${base}` : ''}/${n}/`
  }, [currentPath, name])

  const handleSubmit = async () => {
    setError(null)
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      setIsSubmitting(true)
      await onCreate(name.trim())
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Icons.folder className="h-5 w-5" />
            <span>New Folder</span>
          </DialogTitle>
          <DialogDescription>
            Create a new folder at the current location. Folders are represented by a hidden placeholder object and will be preserved until the folder is deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            placeholder="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="text-xs text-muted-foreground">
            Path: <span className="font-mono">{fullPathPreview}</span>
          </div>
          {(error || validationError) && (
            <div className="text-xs text-red-500">{error || validationError}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!!validationError || isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

