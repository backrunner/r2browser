import { useEffect, useState } from 'react'
import { Icons } from '@/components/ui/icons'
import {
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  windowIsMaximized,
} from '@/lib/window'

// Extend CSSProperties to include WebkitAppRegion
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

export function TitleBar() {
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    // Query initial maximized state so we can render the proper icon
    windowIsMaximized().then(setIsMax).catch(() => setIsMax(false))
  }, [])

  const handleToggleMax = async () => {
    const next = await windowToggleMaximize()
    setIsMax(next)
  }

  return (
    <div
      className="h-8 w-full flex items-center select-none border-b border-border bg-card/95"
      style={{ WebkitAppRegion: 'drag' }}
      onDoubleClick={handleToggleMax}
    >
      <div className="px-3 text-xs text-muted-foreground">R2 Browser</div>
      <div className="flex-1" />
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' }}>
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
    </div>
  )
}
