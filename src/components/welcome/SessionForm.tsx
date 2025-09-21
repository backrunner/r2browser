import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { StorageConfig } from '@/types'

interface SessionFormProps {
  onSessionCreated: (sessionId: string) => void
  initialData?: Partial<StorageConfig>
}

export function SessionForm({ onSessionCreated, initialData }: SessionFormProps) {
  const { createSession, testConnection } = useAppStore()
  const [activeTab, setActiveTab] = useState<'r2' | 's3'>('r2')
  const [isLoading, setIsLoading] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<StorageConfig>({
    type: 'r2',
    session_name: '',
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
    if (!formData.session_name.trim()) {
      setError('Session name is required')
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
    if (!formData.bucket_name.trim()) {
      setError('Bucket name is required')
      return false
    }
    if (activeTab === 'r2' && !formData.account_id?.trim()) {
      setError('Account ID is required for Cloudflare R2')
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
      const result = await testConnection(formData)
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
      const sessionId = await createSession(formData)
      onSessionCreated(sessionId)
    } catch (err) {
      setError(`Failed to create session: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Add Storage Connection</CardTitle>
      </CardHeader>
      <div className="p-6 space-y-4">
        {/* Provider Tabs */}
        <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-lg">
          <Button
            type="button"
            variant={activeTab === 'r2' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleProviderChange('r2')}
            className="text-xs"
          >
            <Icons.cloud className="w-4 h-4 mr-1" />
            Cloudflare R2
          </Button>
          <Button
            type="button"
            variant={activeTab === 's3' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handleProviderChange('s3')}
            className="text-xs"
          >
            <Icons.server className="w-4 h-4 mr-1" />
            S3 Compatible
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Common Fields */}
          <Input
            placeholder="Session Name"
            value={formData.session_name}
            onChange={(e) => handleInputChange('session_name', e.target.value)}
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

          <Input
            placeholder="Bucket Name"
            value={formData.bucket_name}
            onChange={(e) => handleInputChange('bucket_name', e.target.value)}
          />

          {/* Provider-specific Fields */}
          {activeTab === 'r2' && (
            <Input
              placeholder="Account ID (from Cloudflare dashboard)"
              value={formData.account_id || ''}
              onChange={(e) => handleInputChange('account_id', e.target.value)}
            />
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
              <label className="flex items-center space-x-2">
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
            <div className="text-red-500 text-sm">{error}</div>
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
    </Card>
  )
}