import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icons } from '@/components/ui/icons'

interface RenameDialogProps {
  file: { name: string; key: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: (newName: string) => void
}

export function RenameDialog({ file, open, onOpenChange, onRename }: RenameDialogProps) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (file && open) {
      setNewName(file.name)
      setError(null)
    }
  }, [file, open])

  const handleRename = () => {
    if (!newName.trim()) {
      setError('Name cannot be empty')
      return
    }

    if (newName === file?.name) {
      setError('Please enter a different name')
      return
    }

    if (newName.includes('/') || newName.includes('\\')) {
      setError('Name cannot contain / or \\')
      return
    }

    onRename(newName.trim())
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    }
  }

  if (!file) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.edit className="h-5 w-5" />
            Rename File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Current name: <span className="font-normal text-muted-foreground">{file.name}</span>
            </label>
            <Input
              id="name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter new name"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <Icons.warning className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={!newName.trim() || newName === file.name}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
