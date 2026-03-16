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

function getChannelLabel(channel: UpdateStatus['channel']) {
  return channel === 'beta' ? 'Beta channel' : 'Stable channel';
}

export function UpdateDialog({
  open,
  onOpenChange,
  status,
  onUpdate,
  onCheckForUpdates,
}: UpdateDialogProps) {
  const channelLabel = getChannelLabel(status.channel);
  const progressLabel = status.totalBytes
    ? `${Math.round(status.downloadProgress ?? 0)}%`
    : 'Preparing update...';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.download className="h-5 w-5" />
            Software Update
          </DialogTitle>
          <DialogDescription>
            {status.checking && `Checking ${channelLabel.toLowerCase()} for updates...`}
            {status.available && !status.downloading && !status.readyToInstall && (
              <>A new update is available on the {channelLabel.toLowerCase()}.</>
            )}
            {status.downloading && 'Downloading and preparing the update...'}
            {status.readyToInstall && 'Update installed. Restart the app to finish.'}
            {!status.checking && !status.available && !status.downloading && !status.readyToInstall && (
              <>You are using the latest release from the {channelLabel.toLowerCase()}.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Update Channel</span>
              <span className="font-medium">{channelLabel}</span>
            </div>
          </div>

          {(status.available || status.downloading || status.readyToInstall) && (
            <div className="space-y-2 rounded-lg border p-3">
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

          {status.updateInfo?.body && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Release Notes
              </p>
              <p className="max-h-28 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                {status.updateInfo.body}
              </p>
            </div>
          )}

          {status.downloading && (
            <div className="space-y-2">
              <Progress value={status.downloadProgress ?? undefined} className="h-2" />
              <p className="text-center text-xs text-muted-foreground">{progressLabel}</p>
            </div>
          )}

          {status.readyToInstall && (
            <div className="flex items-center justify-center py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Icons.check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          )}

          {status.error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <Icons.alertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{status.error}</span>
              </div>
            </div>
          )}

          {!status.checking && !status.available && !status.error && (
            <div className="flex items-center justify-center py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
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
                Restart Now
              </Button>
            </>
          ) : status.available && !status.downloading ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onUpdate} className="flex items-center gap-2">
                <Icons.download className="h-4 w-4" />
                Download and Restart
              </Button>
            </>
          ) : status.downloading ? (
            <Button disabled className="w-full">
              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              Downloading...
            </Button>
          ) : status.checking ? (
            <Button disabled className="w-full">
              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
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
