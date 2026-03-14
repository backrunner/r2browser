import { useTranslation } from 'react-i18next'
import { CloudflareProfile } from '@/types'
import { Icons } from '@/components/ui/icons'
import * as Select from '@radix-ui/react-select'
import { cn } from '@/lib/utils'

interface ProfileSelectorProps {
  profiles: CloudflareProfile[]
  currentProfile: CloudflareProfile | null
  onProfileChange: (profile: CloudflareProfile) => void
  onManageProfiles: () => void
}

export function ProfileSelector({
  profiles,
  currentProfile,
  onProfileChange,
  onManageProfiles,
}: ProfileSelectorProps) {
  const { t } = useTranslation()

  if (profiles.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm text-muted-foreground select-none">
        <Icons.info className="h-4 w-4" />
        <span>{t('profile.noProfiles')}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Select.Root
        value={currentProfile?.id || ''}
        onValueChange={(value) => {
          const profile = profiles.find(p => p.id === value)
          if (profile) onProfileChange(profile)
        }}
      >
        <Select.Trigger
          className={cn(
            'flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-background hover:bg-accent transition-colors',
            'text-sm font-medium select-none outline-none focus:ring-2 focus:ring-ring',
            'min-w-[200px]'
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icons.cloud className="h-4 w-4 flex-shrink-0" />
            <Select.Value placeholder={t('profile.selectProfile')}>
              {currentProfile ? (
                <span className="truncate">{currentProfile.name}</span>
              ) : (
                <span className="text-muted-foreground">{t('profile.selectProfile')}</span>
              )}
            </Select.Value>
          </div>
          <Select.Icon>
            <Icons.chevronRight className="h-4 w-4 rotate-90" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className={cn(
              'overflow-hidden rounded-md border border-border bg-popover shadow-lg',
              'animate-in fade-in-80'
            )}
            position="popper"
            sideOffset={5}
          >
            <Select.Viewport className="p-1">
              {profiles.map((profile) => (
                <Select.Item
                  key={profile.id}
                  value={profile.id}
                  className={cn(
                    'relative flex items-center gap-2 px-3 py-2 rounded-sm text-sm outline-none cursor-pointer select-none',
                    'hover:bg-accent focus:bg-accent transition-colors',
                    'data-[state=checked]:bg-accent/50'
                  )}
                >
                  <Select.ItemText>
                    <div className="flex items-center gap-2">
                      <Icons.cloud className="h-4 w-4" />
                      <span>{profile.name}</span>
                    </div>
                  </Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    <Icons.check className="h-4 w-4" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}

              <Select.Separator className="h-px bg-border my-1" />

              <div
                className="flex items-center gap-2 px-3 py-2 rounded-sm text-sm cursor-pointer hover:bg-accent transition-colors text-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  onManageProfiles()
                }}
              >
                <Icons.settings className="h-4 w-4" />
                <span>{t('profile.manageProfiles')}</span>
              </div>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
