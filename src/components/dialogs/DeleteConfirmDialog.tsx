import { useTranslation } from 'react-i18next'
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

interface DeleteConfirmDialogProps {
  files: { name: string; type: 'file' | 'folder' }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteConfirmDialog({ files, open, onOpenChange, onConfirm }: DeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const fileCount = files.filter(f => f.type === 'file').length
  const folderCount = files.filter(f => f.type === 'folder').length

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  const getTitle = () => {
    if (files.length === 1) {
      return files[0].type === 'folder' ? t('deleteDialog.deleteFolder') : t('deleteDialog.deleteFile')
    }
    return t('deleteDialog.deleteItems')
  }

  const getDescription = () => {
    if (files.length === 1) {
      const item = files[0]
      return (
        <>
          {t('deleteDialog.confirmSingle', { name: item.name })}
          {item.type === 'folder' && (
            <span className="block mt-2 text-sm">
              {t('deleteDialog.folderWarning')}
            </span>
          )}
        </>
      )
    }

    const parts: string[] = []
    if (fileCount > 0) parts.push(t('deleteDialog.filesCount', { count: fileCount }))
    if (folderCount > 0) parts.push(t('deleteDialog.foldersCount', { count: folderCount }))

    return (
      <>
        {fileCount > 0 && folderCount > 0
          ? t('deleteDialog.confirmMultiple', { files: parts[0], folders: parts[1] })
          : fileCount > 0
            ? t('deleteDialog.confirmMultipleFiles', { count: fileCount })
            : t('deleteDialog.confirmMultipleFolders', { count: folderCount })
        }
        {folderCount > 0 && (
          <span className="block mt-2 text-sm">
            {t('deleteDialog.folderContentsWarning')}
          </span>
        )}
      </>
    )
  }

  // Don't prevent rendering even if files is empty - let the Dialog handle the open state
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 select-none">
            <Icons.warning className="h-5 w-5 text-destructive" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="pt-2 select-none">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            <Icons.delete className="h-4 w-4 mr-2" />
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
