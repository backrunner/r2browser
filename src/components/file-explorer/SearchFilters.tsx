import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

export interface SearchFilters {
  // File type filters
  fileTypes: {
    images: boolean
    documents: boolean
    audio: boolean
    video: boolean
    archives: boolean
    folders: boolean
  }
  // Size filters
  sizeFilter: {
    enabled: boolean
    operator: 'lt' | 'gt' | 'between'
    minSize: number // in bytes
    maxSize: number // in bytes
    unit: 'KB' | 'MB' | 'GB'
  }
  // Date filters
  dateFilter: {
    enabled: boolean
    period: 'today' | '7days' | '30days' | '90days' | 'year'
  }
}

export const defaultFilters: SearchFilters = {
  fileTypes: {
    images: true,
    documents: true,
    audio: true,
    video: true,
    archives: true,
    folders: true,
  },
  sizeFilter: {
    enabled: false,
    operator: 'lt',
    minSize: 0,
    maxSize: 100,
    unit: 'MB',
  },
  dateFilter: {
    enabled: false,
    period: '30days',
  },
}

// File type extension mappings
const FILE_TYPE_EXTENSIONS: Record<keyof SearchFilters['fileTypes'], string[]> = {
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif'],
  documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
  video: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  folders: [], // Special case - handled separately
}

interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  onReset: () => void
}

export function SearchFiltersPanel({ filters, onFiltersChange, onReset }: SearchFiltersProps) {
  const [open, setOpen] = useState(false)
  const activeFilterCount = countActiveFilters(filters)

  const updateFileTypes = (type: keyof SearchFilters['fileTypes'], value: boolean) => {
    onFiltersChange({
      ...filters,
      fileTypes: {
        ...filters.fileTypes,
        [type]: value,
      },
    })
  }

  const updateSizeFilter = (updates: Partial<SearchFilters['sizeFilter']>) => {
    onFiltersChange({
      ...filters,
      sizeFilter: {
        ...filters.sizeFilter,
        ...updates,
      },
    })
  }

  const updateDateFilter = (updates: Partial<SearchFilters['dateFilter']>) => {
    onFiltersChange({
      ...filters,
      dateFilter: {
        ...filters.dateFilter,
        ...updates,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Icons.filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Search Filters</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onReset}
            >
              Reset All
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Type Filters */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">File Types</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(filters.fileTypes) as Array<keyof SearchFilters['fileTypes']>).map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox
                    id={`type-${type}`}
                    checked={filters.fileTypes[type]}
                    onCheckedChange={(checked) => updateFileTypes(type, checked as boolean)}
                  />
                  <label
                    htmlFor={`type-${type}`}
                    className="text-sm capitalize cursor-pointer"
                  >
                    {type}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Size Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="size-filter"
                checked={filters.sizeFilter.enabled}
                onCheckedChange={(checked) => updateSizeFilter({ enabled: checked as boolean })}
              />
              <Label htmlFor="size-filter" className="text-sm font-medium cursor-pointer">
                Filter by Size
              </Label>
            </div>

            {filters.sizeFilter.enabled && (
              <div className="pl-6 space-y-2">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                      {filters.sizeFilter.operator === 'lt' && 'Less than'}
                      {filters.sizeFilter.operator === 'gt' && 'Greater than'}
                      {filters.sizeFilter.operator === 'between' && 'Between'}
                      <Icons.chevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="min-w-32 bg-popover border rounded-md shadow-md p-1 z-50">
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateSizeFilter({ operator: 'lt' })}
                      >
                        Less than
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateSizeFilter({ operator: 'gt' })}
                      >
                        Greater than
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateSizeFilter({ operator: 'between' })}
                      >
                        Between
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <div className="flex items-center gap-2">
                  {filters.sizeFilter.operator === 'between' && (
                    <>
                      <Input
                        type="number"
                        value={filters.sizeFilter.minSize}
                        onChange={(e) => updateSizeFilter({ minSize: Number(e.target.value) })}
                        className="h-8 w-20"
                        min={0}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                    </>
                  )}
                  <Input
                    type="number"
                    value={filters.sizeFilter.maxSize}
                    onChange={(e) => updateSizeFilter({ maxSize: Number(e.target.value) })}
                    className="h-8 w-20"
                    min={0}
                  />
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-16">
                        {filters.sizeFilter.unit}
                        <Icons.chevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content className="min-w-16 bg-popover border rounded-md shadow-md p-1 z-50">
                        {(['KB', 'MB', 'GB'] as const).map((unit) => (
                          <DropdownMenu.Item
                            key={unit}
                            className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                            onSelect={() => updateSizeFilter({ unit })}
                          >
                            {unit}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Date Filter */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="date-filter"
                checked={filters.dateFilter.enabled}
                onCheckedChange={(checked) => updateDateFilter({ enabled: checked as boolean })}
              />
              <Label htmlFor="date-filter" className="text-sm font-medium cursor-pointer">
                Filter by Date
              </Label>
            </div>

            {filters.dateFilter.enabled && (
              <div className="pl-6">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full justify-between">
                      {filters.dateFilter.period === 'today' && 'Today'}
                      {filters.dateFilter.period === '7days' && 'Last 7 days'}
                      {filters.dateFilter.period === '30days' && 'Last 30 days'}
                      {filters.dateFilter.period === '90days' && 'Last 90 days'}
                      {filters.dateFilter.period === 'year' && 'Last year'}
                      <Icons.chevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="min-w-32 bg-popover border rounded-md shadow-md p-1 z-50">
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateDateFilter({ period: 'today' })}
                      >
                        Today
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateDateFilter({ period: '7days' })}
                      >
                        Last 7 days
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateDateFilter({ period: '30days' })}
                      >
                        Last 30 days
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateDateFilter({ period: '90days' })}
                      >
                        Last 90 days
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                        onSelect={() => updateDateFilter({ period: 'year' })}
                      >
                        Last year
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper function to count active filters
function countActiveFilters(filters: SearchFilters): number {
  let count = 0

  // Count disabled file types
  const disabledTypes = Object.values(filters.fileTypes).filter(v => !v).length
  if (disabledTypes > 0) count++

  // Count size filter
  if (filters.sizeFilter.enabled) count++

  // Count date filter
  if (filters.dateFilter.enabled) count++

  return count
}

// Helper function to convert size to bytes
function sizeToBytes(size: number, unit: 'KB' | 'MB' | 'GB'): number {
  const multipliers = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  }
  return size * multipliers[unit]
}

// Helper function to get date threshold
function getDateThreshold(period: SearchFilters['dateFilter']['period']): Date {
  const now = new Date()
  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case '7days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90days':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    default:
      return new Date(0)
  }
}

// Helper function to get file extension
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : ''
}

// Helper function to determine file type category
function getFileTypeCategory(filename: string, isFolder: boolean): keyof SearchFilters['fileTypes'] | null {
  if (isFolder) return 'folders'

  const ext = getFileExtension(filename)
  for (const [category, extensions] of Object.entries(FILE_TYPE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return category as keyof SearchFilters['fileTypes']
    }
  }
  return null // Unknown type - always show
}

// Export filter function for use in FileManagerPage
export function applySearchFilters<T extends { name: string; type: 'file' | 'folder'; size?: number; lastModified?: Date | string }>(
  files: T[],
  searchQuery: string,
  filters: SearchFilters
): T[] {
  return files.filter(file => {
    // First apply search query filter
    if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    // Apply file type filter
    const category = getFileTypeCategory(file.name, file.type === 'folder')
    if (category && !filters.fileTypes[category]) {
      return false
    }

    // Apply size filter (only for files)
    if (filters.sizeFilter.enabled && file.type === 'file' && file.size !== undefined) {
      const minBytes = filters.sizeFilter.operator === 'between'
        ? sizeToBytes(filters.sizeFilter.minSize, filters.sizeFilter.unit)
        : 0
      const maxBytes = sizeToBytes(filters.sizeFilter.maxSize, filters.sizeFilter.unit)

      switch (filters.sizeFilter.operator) {
        case 'lt':
          if (file.size >= maxBytes) return false
          break
        case 'gt':
          if (file.size <= maxBytes) return false
          break
        case 'between':
          if (file.size < minBytes || file.size > maxBytes) return false
          break
      }
    }

    // Apply date filter
    if (filters.dateFilter.enabled && file.lastModified) {
      const fileDate = typeof file.lastModified === 'string'
        ? new Date(file.lastModified)
        : file.lastModified
      const threshold = getDateThreshold(filters.dateFilter.period)

      if (fileDate < threshold) return false
    }

    return true
  })
}
