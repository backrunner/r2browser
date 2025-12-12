import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
    if (!trimmed) return t('folder.nameRequired')
    if (trimmed === '.' || trimmed === '..' || trimmed === '.folder') return t('folder.invalidName')
    if (trimmed.includes('/')) return t('folder.noSlashes')
    if (trimmed.includes('\\')) return t('folder.noBackslashes')
    return null
  }, [name, t])

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
            <span>{t('folder.newFolderTitle')}</span>
          </DialogTitle>
          <DialogDescription>
            {t('folder.newFolderDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            placeholder={t('folder.folderName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="text-xs text-muted-foreground select-none">
            {t('folder.pathDisplay', { path: fullPathPreview })}
          </div>
          {(error || validationError) && (
            <div className="text-xs text-red-500 select-none">{error || validationError}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!!validationError || isSubmitting}>
            {isSubmitting ? t('common.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

