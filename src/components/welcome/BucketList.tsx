import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
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
      <div className="text-center py-8 text-muted-foreground select-none">
        <div className="flex flex-col items-center gap-3">
          <Icons.database className="h-12 w-12 opacity-40" />
          <p className="text-sm">{t('welcome.noBuckets')}</p>
          <p className="text-xs">{t('welcome.noBucketsDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {buckets.map((bucket) => (
        <ContextMenu key={bucket.name}>
          <ContextMenuTrigger asChild>
            <Card
              className="cursor-pointer hover:shadow-md transition-all duration-200 border-border hover:border-primary/50 select-none"
              onClick={() => onBucketSelect(bucket.name)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <Icons.database className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">
                        {bucket.name}
                      </h3>
                      <div className="flex items-center space-x-3 text-xs text-muted-foreground">
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
              </CardContent>
            </Card>
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
