import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { StorageConfig } from '@/types'
import { invoke } from '@tauri-apps/api/core'

interface SessionFormProps {
  onSessionCreated: (sessionId: string) => void
  initialData?: Partial<StorageConfig>
  sessionId?: string  // If provided, we're editing an existing session
}

export function SessionForm({ onSessionCreated, initialData, sessionId }: SessionFormProps) {
  const { createSession, testConnection } = useAppStore()
  const [activeTab, setActiveTab] = useState<'r2' | 's3'>(
    (initialData?.type as 'r2' | 's3') || 'r2'
  )
  const [isLoading, setIsLoading] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(sessionId)

  const [formData, setFormData] = useState<StorageConfig>({
    type: 'r2',
    access_key_id: '',
    secret_access_key: '',
    bucket_name: '',
    // R2 specific
    account_id: '',
    // S3 specific
    region: 'us-east-1',
    endpoint: '',
    force_path_style: false,
    ...initialData,
  })

  // Accept both raw account id or a full R2 endpoint URL in the R2 account field.
  // We do not mutate the user's input; instead we normalize right before validation/submission.
  const normalizeR2AccountId = (value: string | undefined): string => {
    const raw = (value || '').trim()
    if (!raw) return ''

    // If it's a URL, try to parse hostname and extract the subdomain as account id
    const looksLikeUrl = /^(https?:)?\/\//i.test(raw) || raw.includes('r2.cloudflarestorage.com')
    if (looksLikeUrl) {
      try {
        // Ensure URL constructor can parse when scheme is missing
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
        const host = url.hostname.toLowerCase()
        if (host.endsWith('.r2.cloudflarestorage.com')) {
          const accountPart = host.split('.')[0]
          return accountPart
        }
        // Not a recognized R2 hostname; fallthrough to return raw
      } catch {
        // Ignore parse error and fall back to raw
      }
    }

    // Otherwise assume user supplied the account id directly
    return raw
  }

  // For UX hints, compute what we will use after normalization (only for R2)
  const normalizedAccountId = useMemo(() => (
    formData.type === 'r2' ? normalizeR2AccountId(formData.account_id) : ''
  ), [formData.type, formData.account_id])

  const handleInputChange = (field: keyof StorageConfig, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleProviderChange = (provider: 'r2' | 's3') => {
    setActiveTab(provider)
    setFormData(prev => ({
      ...prev,
      type: provider,
      region: provider === 'r2' ? 'auto' : 'us-east-1',
      endpoint: provider === 'r2' ? '' : '',
    }))
  }

  const validateForm = (): boolean => {
    if (!formData.bucket_name.trim()) {
      setError('Bucket name is required')
      return false
    }
    if (!formData.access_key_id.trim()) {
      setError('Access Key ID is required')
      return false
    }
    if (!formData.secret_access_key.trim()) {
      setError('Secret Access Key is required')
      return false
    }
    if (activeTab === 'r2' && !normalizedAccountId) {
      setError('Account ID or R2 endpoint URL is required')
      return false
    }
    if (activeTab === 's3' && !formData.endpoint?.trim()) {
      setError('Endpoint is required for S3-compatible storage')
      return false
    }
    return true
  }

  const handleTestConnection = async () => {
    if (!validateForm()) return

    setTestingConnection(true)
    setError(null)

    try {
      const payload: StorageConfig = formData.type === 'r2'
        ? { ...formData, account_id: normalizedAccountId, region: 'auto' }
        : formData
      const result = await testConnection(payload)
      if (result) {
        alert('Connection successful!')
      } else {
        setError('Connection failed. Please check your credentials.')
      }
    } catch (err) {
      setError(`Connection failed: ${err}`)
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    setError(null)

    try {
      const payload: StorageConfig = formData.type === 'r2'
        ? { ...formData, account_id: normalizedAccountId, region: 'auto' }
        : formData

      // Validate credentials and bucket before saving the session
      const ok = await testConnection(payload)
      if (!ok) {
        setError('Connection failed. Please check your credentials and bucket name.')
        return
      }

      let resultSessionId: string

      if (isEditing && sessionId) {
        // Update existing session
        await invoke('save_session', { sessionId, config: payload })
        // Reload sessions to get the updated list
        await useAppStore.getState().loadSessions()
        resultSessionId = sessionId
      } else {
        // Create new session
        resultSessionId = await createSession(payload)
      }

      onSessionCreated(resultSessionId)
    } catch (err) {
      setError(`Failed to ${isEditing ? 'update' : 'create'} session: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
        {/* Provider Tabs */}
        <div className="grid grid-cols-2 gap-3 select-none">
          <button
            type="button"
            onClick={() => handleProviderChange('r2')}
            className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
              activeTab === 'r2' ? 'border-primary' : 'border-border'
            }`}
          >
            <Icons.cloud className="h-6 w-6" />
            <span className="text-sm font-medium">Cloudflare R2</span>
            {activeTab === 'r2' && (
              <div className="absolute top-2 right-2">
                <Icons.check className="h-4 w-4 text-primary" />
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleProviderChange('s3')}
            className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 hover:bg-accent transition-colors ${
              activeTab === 's3' ? 'border-primary' : 'border-border'
            }`}
          >
            <Icons.server className="h-6 w-6" />
            <span className="text-sm font-medium">S3 Compatible</span>
            {activeTab === 's3' && (
              <div className="absolute top-2 right-2">
                <Icons.check className="h-4 w-4 text-primary" />
              </div>
            )}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Common Fields */}
          <Input
            placeholder="Bucket Name"
            value={formData.bucket_name}
            onChange={(e) => handleInputChange('bucket_name', e.target.value)}
          />

          <Input
            placeholder="Access Key ID"
            value={formData.access_key_id}
            onChange={(e) => handleInputChange('access_key_id', e.target.value)}
          />

          <Input
            type="password"
            placeholder="Secret Access Key"
            value={formData.secret_access_key}
            onChange={(e) => handleInputChange('secret_access_key', e.target.value)}
          />

          {/* Provider-specific Fields */}
          {activeTab === 'r2' && (
            <div className="space-y-1">
              <Input
                placeholder="Account ID"
                value={formData.account_id || ''}
                onChange={(e) => handleInputChange('account_id', e.target.value)}
              />
              {/* Subtle hint showing normalized account id when user pasted a full URL */}
              {formData.account_id && normalizedAccountId && formData.account_id.trim() !== normalizedAccountId && (
                <div className="text-xs text-muted-foreground select-none">Using account: <span className="font-mono">{normalizedAccountId}</span></div>
              )}
            </div>
          )}

          {activeTab === 's3' && (
            <>
              <Input
                placeholder="Endpoint URL (e.g., https://s3.amazonaws.com)"
                value={formData.endpoint || ''}
                onChange={(e) => handleInputChange('endpoint', e.target.value)}
              />
              <Input
                placeholder="Region (e.g., us-east-1)"
                value={formData.region || ''}
                onChange={(e) => handleInputChange('region', e.target.value)}
              />
              <label className="flex items-center space-x-2 select-none">
                <input
                  type="checkbox"
                  checked={formData.force_path_style || false}
                  onChange={(e) => handleInputChange('force_path_style', e.target.checked)}
                />
                <span className="text-sm">Force path-style URLs</span>
              </label>
            </>
          )}

          {error && (
            <div className="text-destructive text-sm select-none">{error}</div>
          )}

          <div className="flex space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="flex-1"
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Creating...' : 'Add Session'}
            </Button>
          </div>
        </form>
    </div>
  )
}
