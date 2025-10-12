import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'

interface SplitPaneManagerProps {
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  onClose?: () => void
}

export function SplitPaneManager({ leftPane, rightPane, onClose }: SplitPaneManagerProps) {
  const [leftWidth, setLeftWidth] = useState(50) // Percentage
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDown = () => {
    setIsResizing(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isResizing) return

    const container = e.currentTarget as HTMLDivElement
    const containerRect = container.getBoundingClientRect()
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100

    // Constrain between 20% and 80%
    if (newLeftWidth >= 20 && newLeftWidth <= 80) {
      setLeftWidth(newLeftWidth)
    }
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  return (
    <div
      className="h-full flex relative"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Left pane */}
      <div
        className="h-full overflow-hidden"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPane}
      </div>

      {/* Resizer */}
      <div
        className="w-1 bg-border hover:bg-primary cursor-col-resize transition-colors relative group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/10" />
      </div>

      {/* Right pane */}
      <div
        className="h-full overflow-hidden flex-1"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPane}
      </div>

      {/* Close button */}
      {onClose && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 z-10 h-8 w-8 p-0"
          onClick={onClose}
          title="Close split view"
        >
          <Icons.x className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
