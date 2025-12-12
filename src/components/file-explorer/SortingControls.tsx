import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'

type SortBy = 'name' | 'size' | 'modified'
type SortOrder = 'asc' | 'desc'

interface SortingControlsProps {
  sortBy: SortBy
  sortOrder: SortOrder
  onSortByChange: (sortBy: SortBy) => void
  onSortOrderChange: (order: SortOrder) => void
}

const sortByLabels: Record<SortBy, string> = {
  name: 'Name',
  size: 'Size',
  modified: 'Date Modified',
}

export function SortingControls({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: SortingControlsProps) {
  const toggleSortOrder = () => {
    onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1"
            title={`Sort by: ${sortByLabels[sortBy]}`}
          >
            <Icons.sort className="h-4 w-4" />
            <span className="text-xs hidden sm:inline">{sortByLabels[sortBy]}</span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          sideOffset={6}
          className="z-50 min-w-[140px] border border-border bg-background rounded-md p-1 shadow-lg"
        >
          {(Object.keys(sortByLabels) as SortBy[]).map((key) => (
            <DropdownMenu.Item
              key={key}
              className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent ${
                sortBy === key ? 'bg-accent/50' : ''
              }`}
              onSelect={() => onSortByChange(key)}
            >
              {sortBy === key && <Icons.check className="h-3 w-3" />}
              {sortBy !== key && <span className="w-3" />}
              {sortByLabels[key]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={toggleSortOrder}
        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortOrder === 'asc' ? (
          <Icons.sortAsc className="h-4 w-4" />
        ) : (
          <Icons.sortDesc className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
