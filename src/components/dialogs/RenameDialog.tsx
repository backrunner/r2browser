import { useState, useEffect, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      setError(t('renameDialog.emptyName'))
      return
    }

    if (newName === file?.name) {
      setError(t('renameDialog.sameName'))
      return
    }

    if (newName.includes('/') || newName.includes('\\')) {
      setError(t('renameDialog.invalidChars'))
      return
    }

    onRename(newName.trim())
    onOpenChange(false)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
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
            {t('renameDialog.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium select-none">
              {t('renameDialog.currentName', { name: file.name })}
            </label>
            <Input
              id="name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('renameDialog.newName')}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1 select-none">
                <Icons.warning className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleRename} disabled={!newName.trim() || newName === file.name}>
            {t('common.rename')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
