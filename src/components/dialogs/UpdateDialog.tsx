import { Icons } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import type { UpdateStatus } from '@/hooks/use-updater';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: UpdateStatus;
  onUpdate: () => void;
  onCheckForUpdates: () => void;
}

export function UpdateDialog({
  open,
  onOpenChange,
  status,
  onUpdate,
  onCheckForUpdates,
}: UpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.download className="h-5 w-5" />
            Software Update
          </DialogTitle>
          <DialogDescription>
            {status.checking && 'Checking for updates...'}
            {status.available && !status.downloading && !status.readyToInstall && (
              <>A new version is available</>
            )}
            {status.downloading && 'Downloading update...'}
            {status.readyToInstall && 'Update ready to install'}
            {!status.checking && !status.available && !status.downloading && !status.readyToInstall && (
              <>You are using the latest version</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Version Information */}
          {(status.available || status.downloading || status.readyToInstall) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Version</span>
                <span className="font-medium">{status.currentVersion}</span>
              </div>
              {status.latestVersion && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Latest Version</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {status.latestVersion}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Progress Indicator */}
          {status.downloading && (
            <div className="space-y-2">
              <Progress value={undefined} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Downloading update...
              </p>
            </div>
          )}

          {/* Success Icon */}
          {status.readyToInstall && (
            <div className="flex items-center justify-center py-4">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Icons.check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          )}

          {/* Error Message */}
          {status.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <Icons.alertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{status.error}</span>
              </div>
            </div>
          )}

          {/* No Update Available */}
          {!status.checking && !status.available && !status.error && (
            <div className="flex items-center justify-center py-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Icons.check className="h-8 w-8 text-primary" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {status.readyToInstall ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Later
              </Button>
              <Button onClick={onUpdate} className="flex items-center gap-2">
                <Icons.refresh className="h-4 w-4" />
                Install and Restart
              </Button>
            </>
          ) : status.available && !status.downloading ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onUpdate} className="flex items-center gap-2">
                <Icons.download className="h-4 w-4" />
                Download Update
              </Button>
            </>
          ) : status.downloading ? (
            <Button disabled className="w-full">
              <Icons.loader className="h-4 w-4 animate-spin mr-2" />
              Downloading...
            </Button>
          ) : status.checking ? (
            <Button disabled className="w-full">
              <Icons.loader className="h-4 w-4 animate-spin mr-2" />
              Checking...
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={onCheckForUpdates} className="flex items-center gap-2">
                <Icons.refresh className="h-4 w-4" />
                Check Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
