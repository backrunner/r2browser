import { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/ui/icons'
import { BucketInfo } from '@/types'

interface DeleteBucketDialogProps {
  bucket: BucketInfo | null
  open: boolean
  onClose: () => void
  onConfirm: (bucket: BucketInfo) => void
}

export function DeleteBucketDialog({
  bucket,
  open,
  onClose,
  onConfirm,
}: DeleteBucketDialogProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const bucketName = bucket?.name || ''
  const isMatch = inputValue === bucketName

  useEffect(() => {
    if (!open) {
      setInputValue('')
      setIsDeleting(false)
    }
  }, [open])

  const handleConfirm = async () => {
    if (!bucket || !isMatch) return
    setIsDeleting(true)
    try {
      await onConfirm(bucket)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Icons.warning className="h-5 w-5" />
            {t('contextMenu.deleteBucket')}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {t('welcome.deleteBucketConfirm', { name: bucketName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">{t('deleteDialog.folderWarning')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucket-name" className="text-sm">
              {t('deleteBucket.typeToConfirm', { name: bucketName })}
            </Label>
            <Input
              id="bucket-name"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={bucketName}
              className="font-mono"
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isMatch || isDeleting}
          >
            {isDeleting ? (
              <>
                <Icons.loading className="h-4 w-4 mr-2 animate-spin" />
                {t('common.delete')}
              </>
            ) : (
              <>
                <Icons.delete className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
