import { useTranslation } from 'react-i18next'
import { Icons } from '@/components/ui/icons'
import { BucketInfo } from '@/types'
import { format } from 'date-fns'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface BucketListProps {
  buckets: BucketInfo[]
  onBucketSelect: (bucketName: string) => void
  onManageCors?: (bucket: BucketInfo) => void
  onDeleteBucket?: (bucket: BucketInfo) => void
}

export function BucketList({
  buckets,
  onBucketSelect,
  onManageCors,
  onDeleteBucket,
}: BucketListProps) {
  const { t } = useTranslation()

  if (buckets.length === 0) {
    return (
      <div className="text-left py-10 text-muted-foreground select-none">
        <div className="flex flex-col items-start gap-3">
          <Icons.database className="h-6 w-6" />
          <p className="text-sm">{t('welcome.noBuckets')}</p>
          <p className="text-xs">{t('welcome.noBucketsDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/60">
      {buckets.map((bucket) => (
        <ContextMenu key={bucket.name}>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              className="w-full rounded-md px-2 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors select-none"
              onClick={() => onBucketSelect(bucket.name)}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <Icons.database className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block font-medium text-sm truncate">
                        {bucket.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center">
                          <Icons.clock className="h-3 w-3 mr-1" />
                          {format(new Date(bucket.creation_date), 'MMM d, yyyy')}
                        </span>
                        {bucket.location && (
                          <span className="flex items-center">
                            <Icons.server className="h-3 w-3 mr-1" />
                            {bucket.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Icons.forward className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
              </div>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => onBucketSelect(bucket.name)}>
              <Icons.folder className="h-4 w-4 mr-2" />
              <span>{t('contextMenu.openBucket')}</span>
            </ContextMenuItem>
            {onManageCors && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onManageCors(bucket)}>
                  <Icons.settings className="h-4 w-4 mr-2" />
                  <span>{t('contextMenu.manageCors')}</span>
                </ContextMenuItem>
              </>
            )}
            {onDeleteBucket && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onDeleteBucket(bucket)}
                  variant="destructive"
                >
                  <Icons.delete className="h-4 w-4 mr-2" />
                  <span>{t('contextMenu.deleteBucket')}</span>
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  )
}
