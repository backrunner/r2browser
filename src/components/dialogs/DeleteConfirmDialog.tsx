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
  const fileCount = files.filter(f => f.type === 'file').length
  const folderCount = files.filter(f => f.type === 'folder').length

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  const getTitle = () => {
    if (files.length === 1) {
      return `Delete ${files[0].type === 'folder' ? 'Folder' : 'File'}`
    }
    return 'Delete Items'
  }

  const getDescription = () => {
    if (files.length === 1) {
      const item = files[0]
      return (
        <>
          Are you sure you want to delete <strong>{item.name}</strong>?
          {item.type === 'folder' && (
            <span className="block mt-2 text-sm">
              This will delete the folder and all its contents.
            </span>
          )}
        </>
      )
    }

    const parts: string[] = []
    if (fileCount > 0) parts.push(`${fileCount} file${fileCount !== 1 ? 's' : ''}`)
    if (folderCount > 0) parts.push(`${folderCount} folder${folderCount !== 1 ? 's' : ''}`)

    return (
      <>
        Are you sure you want to delete {parts.join(' and ')}?
        {folderCount > 0 && (
          <span className="block mt-2 text-sm">
            Folders will be deleted along with all their contents.
          </span>
        )}
      </>
    )
  }

  if (files.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.warning className="h-5 w-5 text-destructive" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            <Icons.delete className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
