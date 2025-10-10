import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import '@/styles/pdf-preview.css'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFPreviewProps {
  url: string
  fileName?: string
}

export function PDFPreview({ url }: PDFPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setIsLoading(false)
    setError(null)
  }

  const onDocumentLoadError = (error: Error) => {
    setError(`Failed to load PDF: ${error.message}`)
    setIsLoading(false)
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1))
  }

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages, prev + 1))
  }

  const zoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.25))
  }

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.25))
  }

  const resetZoom = () => {
    setScale(1.0)
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Icons.error className="h-12 w-12 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[400px] bg-muted/20 rounded-lg overflow-hidden">
      {/* Controls */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 flex items-center gap-2 bg-background/90 px-4 py-2 rounded-md shadow-lg">
        {/* Page Navigation */}
        <Button
          size="sm"
          variant="ghost"
          onClick={goToPrevPage}
          disabled={pageNumber <= 1 || isLoading}
          title="Previous Page"
        >
          <Icons.chevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-sm min-w-[100px] text-center">
          {isLoading ? (
            'Loading...'
          ) : (
            <>Page {pageNumber} / {numPages}</>
          )}
        </span>

        <Button
          size="sm"
          variant="ghost"
          onClick={goToNextPage}
          disabled={pageNumber >= numPages || isLoading}
          title="Next Page"
        >
          <Icons.chevronRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-2" />

        {/* Zoom Controls */}
        <Button
          size="sm"
          variant="ghost"
          onClick={zoomOut}
          disabled={isLoading}
          title="Zoom Out"
        >
          <Icons.zoomOut className="h-4 w-4" />
        </Button>

        <span className="text-sm min-w-[50px] text-center">
          {Math.round(scale * 100)}%
        </span>

        <Button
          size="sm"
          variant="ghost"
          onClick={zoomIn}
          disabled={isLoading}
          title="Zoom In"
        >
          <Icons.zoomIn className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={resetZoom}
          disabled={isLoading}
          title="Reset Zoom"
        >
          <Icons.maximize className="h-4 w-4" />
        </Button>
      </div>

      {/* PDF Document */}
      <div className="h-full overflow-auto flex items-start justify-center p-6 pt-20">
        {isLoading && (
          <div className="flex items-center justify-center">
            <Icons.loading className="h-8 w-8 animate-spin" />
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center p-8">
              <Icons.loading className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            loading={
              <div className="flex items-center justify-center p-8">
                <Icons.loading className="h-6 w-6 animate-spin" />
              </div>
            }
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  )
}
