import { useState, useEffect } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'

interface ImagePreviewProps {
  url: string
  fileName: string
}

export function ImagePreview({ url, fileName }: ImagePreviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)

    const img = new Image()
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      setIsLoading(false)
    }
    img.onerror = () => {
      setError('Failed to load image')
      setIsLoading(false)
    }
    img.src = url
  }, [url])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Icons.loading className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading image...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Icons.image className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[400px] bg-muted/20 rounded-lg overflow-hidden">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        centerOnInit
        wheel={{ step: 0.1 }}
        doubleClick={{ mode: 'reset' }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => zoomIn()}
                title="Zoom In"
              >
                <Icons.zoomIn className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => zoomOut()}
                title="Zoom Out"
              >
                <Icons.zoomOut className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => resetTransform()}
                title="Reset Zoom"
              >
                <Icons.maximize className="h-4 w-4" />
              </Button>
            </div>

            {/* Image Info */}
            {imageDimensions && (
              <div className="absolute bottom-4 left-4 z-10 bg-background/90 px-3 py-2 rounded-md text-xs">
                {imageDimensions.width} × {imageDimensions.height}
              </div>
            )}

            {/* Image Container */}
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              <img
                src={url}
                alt={fileName}
                className="h-full w-auto max-w-full object-contain"
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  )
}
