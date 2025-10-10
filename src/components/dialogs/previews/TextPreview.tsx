import { useState, useEffect } from 'react'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'
// Import common language support
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { getLanguageFromExtension, isBinaryContent } from '@/lib/preview'

interface TextPreviewProps {
  content: string
  fileName: string
}

export function TextPreview({ content, fileName }: TextPreviewProps) {
  const [highlightedCode, setHighlightedCode] = useState<string>('')
  const [lineCount, setLineCount] = useState<number>(0)
  const [isBinary, setIsBinary] = useState(false)

  useEffect(() => {
    // Check if content is binary
    if (isBinaryContent(content)) {
      setIsBinary(true)
      return
    }

    setIsBinary(false)
    const language = getLanguageFromExtension(fileName)
    const lines = content.split('\n')
    setLineCount(lines.length)

    try {
      // Try to highlight with Prism
      const grammar = Prism.languages[language]
      if (grammar) {
        const highlighted = Prism.highlight(content, grammar, language)
        setHighlightedCode(highlighted)
      } else {
        // Fallback to plain text with HTML escaping
        setHighlightedCode(escapeHtml(content))
      }
    } catch (_error) {
      // If highlighting fails, show plain text
      setHighlightedCode(escapeHtml(content))
    }
  }, [content, fileName])

  const escapeHtml = (text: string): string => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content)
  }

  if (isBinary) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Icons.warning className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This file appears to be binary</p>
          <p className="text-xs text-muted-foreground mt-1">Cannot preview binary content</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[400px] bg-muted/20 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <div className="bg-background/90 px-3 py-1 rounded-md text-xs">
          {lineCount} lines
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleCopyContent}
          title="Copy to clipboard"
        >
          <Icons.copy className="h-4 w-4" />
        </Button>
      </div>

      {/* Code Container */}
      <div className="h-full overflow-auto p-6">
        <pre className="text-sm">
          <code
            className={`language-${getLanguageFromExtension(fileName)}`}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>
    </div>
  )
}
