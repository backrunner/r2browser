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
import { countActiveFilters, type SearchFilters } from './search-filter-utils'
export type { SearchFilters } from './search-filter-utils'

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
