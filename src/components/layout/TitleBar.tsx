import { useEffect, useState, MouseEvent } from 'react'
import { Icons } from '@/components/ui/icons'
import {
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
  windowStartDragging,
} from '@/lib/window'

export function TitleBar() {
  const [isMax, setIsMax] = useState(false)
  const [isMacOS, setIsMacOS] = useState(false)

  useEffect(() => {
    // Query initial maximized state so we can render the proper icon
    windowIsMaximized().then(setIsMax).catch(() => setIsMax(false))

    // Detect if running on macOS using userAgent
    const isMac = navigator.userAgent.toLowerCase().includes('mac')
    setIsMacOS(isMac)
  }, [])

  const handleToggleMax = async () => {
    const next = await windowToggleMaximize()
    setIsMax(next)
  }

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Only start dragging on left click
    if (e.button === 0) {
      windowStartDragging().catch(() => {
        // Ignore dragging errors
      })
    }
  }

  return (
    <div
      className="h-8 w-full flex items-center select-none border-b border-border bg-card/95 relative"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleToggleMax}
    >
      {/* macOS traffic lights space */}
      {isMacOS && <div className="w-18" />}

      <div className={isMacOS ? "absolute left-1/2 -translate-x-1/2 text-xs text-muted-foreground" : "px-3 text-xs text-muted-foreground"}>
        R2 Browser
      </div>
      <div className="flex-1" />

      {/* Only show window controls on Windows/Linux, not on macOS */}
      {!isMacOS && (
        <div className="flex">
          <button
            className="h-8 w-12 grid place-items-center hover:bg-muted/60"
            aria-label="Minimize"
            onClick={() => windowMinimize()}
          >
            <Icons.minus className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-12 grid place-items-center hover:bg-muted/60"
            aria-label="Maximize"
            onClick={handleToggleMax}
          >
            {isMax ? (
              // Using the same icon set — replace with a restore icon if desired
              <Icons.minimize className="h-4 w-4" />
            ) : (
              <Icons.maximize className="h-4 w-4" />
            )}
          </button>
          <button
            className="h-8 w-12 grid place-items-center hover:bg-red-500/90 hover:text-white"
            aria-label="Close"
            onClick={() => windowClose()}
          >
            <Icons.x className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
