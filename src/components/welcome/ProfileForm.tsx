import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { CloudflareProfile } from '@/types'

interface ProfileFormProps {
  onProfileSaved: (profileId: string) => void
  editingProfile?: CloudflareProfile | null
}

export function ProfileForm({ onProfileSaved, editingProfile }: ProfileFormProps) {
  const { t } = useTranslation()
  const { createProfile, updateProfile, testProfileAndListBuckets } = useAppStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState(false)

  const [formData, setFormData] = useState({
    name: editingProfile?.name || '',
    account_id: editingProfile?.account_id || '',
    access_key_id: editingProfile?.access_key_id || '',
    secret_access_key: editingProfile?.secret_access_key || '',
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
    setTestSuccess(false)
  }

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError(t('profile.profileNameRequired'))
      return false
    }
    if (!formData.account_id.trim()) {
      setError(t('profile.accountIdRequired'))
      return false
    }
    if (!formData.access_key_id.trim()) {
      setError(t('session.accessKeyRequired'))
      return false
    }
    if (!formData.secret_access_key.trim()) {
      setError(t('session.secretKeyRequired'))
      return false
    }
    return true
  }

  const handleTest = async () => {
    if (!validateForm()) return

    setIsTesting(true)
    setError(null)
    setTestSuccess(false)

    try {
      const buckets = await testProfileAndListBuckets(
        formData.account_id,
        formData.access_key_id,
        formData.secret_access_key
      )

      if (buckets.length === 0) {
        setError(t('profile.noBucketsOrNoPermission'))
        setTestSuccess(false)
      } else {
        setTestSuccess(true)
        setError(null)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (errorMessage.toLowerCase().includes('listbuckets') ||
          errorMessage.toLowerCase().includes('permission')) {
        setError(t('profile.noListBucketsPermission'))
      } else if (errorMessage.toLowerCase().includes('credentials') ||
                 errorMessage.toLowerCase().includes('authentication')) {
        setError(t('profile.invalidCredentials'))
      } else {
        setError(t('profile.validationFailed', { error: errorMessage }))
      }
      setTestSuccess(false)
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!testSuccess) {
      setError(t('profile.testFirst'))
      return
    }

    if (!validateForm()) return

    setIsLoading(true)
    setError(null)

    try {
      if (editingProfile) {
        await updateProfile(editingProfile.id, formData)
        onProfileSaved(editingProfile.id)
      } else {
        const profileId = await createProfile(formData)
        onProfileSaved(profileId)
      }
    } catch (err) {
      setError(t('profile.saveFailed', { action: editingProfile ? t('common.update') : t('common.create'), error: String(err) }))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">{t('profile.profileName')}</Label>
          <Input
            id="profile-name"
            placeholder={t('profile.profileNamePlaceholder')}
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            disabled={isLoading || isTesting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="account-id">{t('session.accountId')}</Label>
          <Input
            id="account-id"
            placeholder={t('session.accountId')}
            value={formData.account_id}
            onChange={(e) => handleInputChange('account_id', e.target.value)}
            disabled={isLoading || isTesting}
          />
          <p className="text-xs text-muted-foreground">
            {t('profile.findInDashboard')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="access-key-id">{t('session.accessKeyId')}</Label>
          <Input
            id="access-key-id"
            placeholder={t('session.accessKeyId')}
            value={formData.access_key_id}
            onChange={(e) => handleInputChange('access_key_id', e.target.value)}
            disabled={isLoading || isTesting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="secret-access-key">{t('session.secretAccessKey')}</Label>
          <Input
            id="secret-access-key"
            type="password"
            placeholder={t('session.secretAccessKey')}
            value={formData.secret_access_key}
            onChange={(e) => handleInputChange('secret_access_key', e.target.value)}
            disabled={isLoading || isTesting}
          />
          <p className="text-xs text-muted-foreground">
            {t('profile.listBucketsNote')}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 flex items-start gap-2">
          <Icons.error className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {testSuccess && (
        <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20 flex items-start gap-2">
          <Icons.check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-600">{t('profile.credentialsValid')}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={isLoading || isTesting}
          className="flex-1"
        >
          {isTesting && <Icons.loading className="h-4 w-4 animate-spin mr-2" />}
          {isTesting ? t('session.testing') : t('profile.testCredentials')}
        </Button>

        <Button
          type="submit"
          disabled={isLoading || isTesting || !testSuccess}
          className="flex-1"
        >
          {isLoading && <Icons.loading className="h-4 w-4 animate-spin mr-2" />}
          {isLoading ? t('common.saving') : editingProfile ? t('profile.updateProfile') : t('profile.saveProfile')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {t('profile.credentialsEncrypted')}
      </p>
    </form>
  )
}
