import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Card, CardContent } from '@/components/ui/card'
import { ProfileForm } from '@/components/welcome/ProfileForm'
import { useAppStore } from '@/stores/app-store'
import { CloudflareProfile } from '@/types'
import { format } from 'date-fns'

interface ProfileManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ViewMode = 'list' | 'add' | 'edit'

export function ProfileManagementDialog({
  open,
  onOpenChange,
}: ProfileManagementDialogProps) {
  const { t } = useTranslation()
  const { profiles, deleteProfile, setCurrentProfile, loadProfiles } = useAppStore()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editingProfile, setEditingProfile] = useState<CloudflareProfile | null>(null)

  const handleAddProfile = () => {
    setEditingProfile(null)
    setViewMode('add')
  }

  const handleEditProfile = (profile: CloudflareProfile) => {
    setEditingProfile(profile)
    setViewMode('edit')
  }

  const handleDeleteProfile = async (profile: CloudflareProfile) => {
    if (confirm(t('profile.deleteConfirm', { name: profile.name }))) {
      await deleteProfile(profile.id)
    }
  }

  const handleProfileSaved = async (profileId: string) => {
    setViewMode('list')
    setEditingProfile(null)
    await loadProfiles()
    const profile = useAppStore.getState().profiles.find(p => p.id === profileId)
    if (profile) {
      setCurrentProfile(profile)
    }
  }

  const handleBack = () => {
    setViewMode('list')
    setEditingProfile(null)
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setViewMode('list')
      setEditingProfile(null)
    }
    onOpenChange(isOpen)
  }

  const renderList = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icons.settings className="h-5 w-5" />
          {t('profile.manageProfiles')}
        </DialogTitle>
        <DialogDescription>
          {t('profile.manageProfilesDescription')}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">
            {profiles.length} {profiles.length === 1 ? t('profile.profile') : t('profile.profiles')}
          </span>
          <Button size="sm" onClick={handleAddProfile}>
            <Icons.plus className="h-4 w-4 mr-2" />
            {t('profile.addProfile')}
          </Button>
        </div>

        <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
          {profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Icons.cloud className="h-16 w-16 mb-4 opacity-40" />
              <p className="text-sm font-medium mb-2">{t('profile.noProfiles')}</p>
              <p className="text-xs text-center max-w-xs mb-4">
                {t('profile.noProfilesDescription')}
              </p>
              <Button size="sm" onClick={handleAddProfile}>
                <Icons.plus className="h-4 w-4 mr-2" />
                {t('profile.addProfile')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => (
                <Card
                  key={profile.id}
                  className="cursor-pointer hover:shadow-md transition-all duration-200 border-border hover:border-primary/50"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <Icons.cloud className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">
                            {profile.name}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="truncate max-w-[120px]" title={profile.account_id}>
                              ID: {profile.account_id.slice(0, 8)}...
                            </span>
                            {profile.last_used && (
                              <span className="flex items-center">
                                <Icons.clock className="h-3 w-3 mr-1" />
                                {format(new Date(profile.last_used), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditProfile(profile)
                          }}
                        >
                          <Icons.edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteProfile(profile)
                          }}
                        >
                          <Icons.delete className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  const renderForm = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 -ml-2"
            onClick={handleBack}
          >
            <Icons.back className="h-4 w-4" />
          </Button>
          <div>
            <DialogTitle>
              {editingProfile ? t('profile.editProfile') : t('profile.addProfile')}
            </DialogTitle>
            <DialogDescription>
              {t('profile.configureCredentials')}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
        <ProfileForm
          onProfileSaved={handleProfileSaved}
          editingProfile={editingProfile}
        />
      </div>
    </>
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {viewMode === 'list' ? renderList() : renderForm()}
      </DialogContent>
    </Dialog>
  )
}
