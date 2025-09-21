import React from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { BreadcrumbItem } from '@/types'

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  onNavigate: (path: string) => void
  onGoBack?: () => void
  onGoUp?: () => void
}

export function Breadcrumb({ items, onNavigate, onGoBack, onGoUp }: BreadcrumbProps) {
  return (
    <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-md">
      {/* Navigation buttons */}
      <div className="flex items-center space-x-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onGoBack}
          disabled={!onGoBack}
          className="h-8 w-8 p-0"
        >
          <Icons.back className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onGoUp}
          disabled={!onGoUp || items.length <= 1}
          className="h-8 w-8 p-0"
        >
          <Icons.up className="h-4 w-4" />
        </Button>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Breadcrumb items */}
      <div className="flex items-center space-x-1 flex-1 min-w-0">
        {items.map((item, index) => (
          <React.Fragment key={item.path}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate(item.path)}
              className={`h-8 px-2 text-sm ${
                index === items.length - 1
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {index === 0 ? (
                <Icons.home className="h-4 w-4" />
              ) : (
                <span className="truncate max-w-32">{item.name}</span>
              )}
            </Button>
            {index < items.length - 1 && (
              <Icons.forward className="h-3 w-3 text-muted-foreground" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}