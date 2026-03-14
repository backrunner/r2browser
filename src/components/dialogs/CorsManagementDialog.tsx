import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/ui/icons'
import { useAppStore } from '@/stores/app-store'
import { BucketInfo, CorsRule } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'

interface CorsManagementDialogProps {
  bucket: BucketInfo | null
  open: boolean
  onClose: () => void
}

export function CorsManagementDialog({ bucket, open, onClose }: CorsManagementDialogProps) {
  const { getBucketCors, updateBucketCors } = useAppStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [corsRules, setCorsRules] = useState<CorsRule[]>([])

  const loadCorsRules = useCallback(async () => {
    if (!bucket) return

    setIsLoading(true)
    setError(null)

    try {
      const corsConfig = await getBucketCors(bucket.name)
      setCorsRules(corsConfig.cors_rules || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      // If no CORS rules exist, that's okay
      if (errorMessage.toLowerCase().includes('not found') ||
          errorMessage.toLowerCase().includes('no cors')) {
        setCorsRules([])
      } else {
        setError(`Failed to load CORS rules: ${errorMessage}`)
      }
    } finally {
      setIsLoading(false)
    }
  }, [bucket, getBucketCors])

  useEffect(() => {
    if (open && bucket) {
      void loadCorsRules()
    }
  }, [bucket, loadCorsRules, open])

  const addRule = () => {
    setCorsRules((previousRules) => [
      ...previousRules,
      {
        allowed_origins: ['*'],
        allowed_methods: ['GET'],
        allowed_headers: ['*'],
        exposed_headers: [],
        max_age_seconds: 3600,
      },
    ])
  }

  const removeRule = (index: number) => {
    setCorsRules((previousRules) => previousRules.filter((_, i) => i !== index))
  }

  const updateRule = <K extends keyof CorsRule>(index: number, field: K, value: CorsRule[K]) => {
    setCorsRules((previousRules) => previousRules.map((rule, ruleIndex) => (
      ruleIndex === index
        ? { ...rule, [field]: value }
        : rule
    )))
  }

  const handleSave = async () => {
    if (!bucket) return

    setIsSaving(true)
    setError(null)

    try {
      await updateBucketCors(bucket.name, { cors_rules: corsRules })
      onClose()
    } catch (err) {
      setError(`Failed to update CORS rules: ${err}`)
    } finally {
      setIsSaving(false)
    }
  }

  const httpMethods = ['GET', 'PUT', 'POST', 'DELETE', 'HEAD']

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.settings className="h-5 w-5" />
            <span>Manage CORS - {bucket?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icons.loading className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {corsRules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Icons.info className="h-12 w-12 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No CORS rules configured</p>
                  <p className="text-xs mt-1">Click "Add Rule" to create a new CORS rule</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {corsRules.map((rule, index) => (
                    <div
                      key={index}
                      className="p-4 border border-border rounded-lg space-y-3 bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Rule {index + 1}</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRule(index)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Icons.delete className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Allowed Origins (comma-separated)</Label>
                          <Input
                            value={rule.allowed_origins.join(', ')}
                            onChange={(e) =>
                              updateRule(
                                index,
                                'allowed_origins',
                                e.target.value.split(',').map((s) => s.trim())
                              )
                            }
                            placeholder="https://example.com, *"
                            className="text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Allowed Methods</Label>
                          <div className="flex flex-wrap gap-3">
                            {httpMethods.map((method) => (
                              <label
                                key={method}
                                className="flex items-center space-x-2 cursor-pointer"
                              >
                                <Checkbox
                                  checked={rule.allowed_methods.includes(method)}
                                  onCheckedChange={(checked) => {
                                    const methods = checked
                                      ? [...rule.allowed_methods, method]
                                      : rule.allowed_methods.filter((m) => m !== method)
                                    updateRule(index, 'allowed_methods', methods)
                                  }}
                                />
                                <span className="text-sm">{method}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Allowed Headers (comma-separated)</Label>
                          <Input
                            value={rule.allowed_headers.join(', ')}
                            onChange={(e) =>
                              updateRule(
                                index,
                                'allowed_headers',
                                e.target.value.split(',').map((s) => s.trim())
                              )
                            }
                            placeholder="Content-Type, Authorization, *"
                            className="text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Max Age (seconds)</Label>
                          <Input
                            type="number"
                            value={rule.max_age_seconds || 3600}
                            onChange={(e) =>
                              updateRule(index, 'max_age_seconds', parseInt(e.target.value) || 3600)
                            }
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 flex items-start gap-2">
              <Icons.error className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={addRule} disabled={isLoading || isSaving}>
            <Icons.plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving && <Icons.loading className="h-4 w-4 animate-spin mr-2" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
