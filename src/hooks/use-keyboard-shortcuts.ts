import { useEffect, useCallback } from 'react'

interface KeyboardShortcutHandlers {
  onCopy?: () => void
  onCut?: () => void
  onPaste?: () => void
  onDelete?: () => void
  onRefresh?: () => void
  onSelectAll?: () => void
  onRename?: () => void
  onOpen?: () => void
  onNewFolder?: () => void
  onUpload?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onEscape?: () => void
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void
}

/**
 * Hook for handling keyboard shortcuts in the file manager
 * @param handlers - Object containing callback functions for each shortcut
 * @param enabled - Whether shortcuts should be active (typically when a session is active)
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  enabled: boolean = true
) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // Skip if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs
        if (e.key === 'Escape' && handlers.onEscape) {
          handlers.onEscape()
        }
        return
      }

      const modKey = isMac ? e.metaKey : e.ctrlKey
      const shiftKey = e.shiftKey

      // Copy: Ctrl/Cmd + C
      if (modKey && !shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        handlers.onCopy?.()
        return
      }

      // Cut: Ctrl/Cmd + X
      if (modKey && !shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        handlers.onCut?.()
        return
      }

      // Paste: Ctrl/Cmd + V
      if (modKey && !shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        handlers.onPaste?.()
        return
      }

      // Select All: Ctrl/Cmd + A
      if (modKey && !shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        handlers.onSelectAll?.()
        return
      }

      // Undo: Ctrl/Cmd + Z
      if (modKey && !shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handlers.onUndo?.()
        return
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (modKey && shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handlers.onRedo?.()
        return
      }
      if (modKey && !shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handlers.onRedo?.()
        return
      }

      // New Folder: Ctrl/Cmd + N
      if (modKey && !shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        handlers.onNewFolder?.()
        return
      }

      // Upload: Ctrl/Cmd + U
      if (modKey && !shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        handlers.onUpload?.()
        return
      }

      // Refresh: F5 or Ctrl/Cmd + R
      if (e.key === 'F5' || (modKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault()
        handlers.onRefresh?.()
        return
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || (e.key === 'Backspace' && !modKey)) {
        e.preventDefault()
        handlers.onDelete?.()
        return
      }

      // Rename: F2
      if (e.key === 'F2') {
        e.preventDefault()
        handlers.onRename?.()
        return
      }

      // Open/Preview: Enter
      if (e.key === 'Enter' && !modKey) {
        e.preventDefault()
        handlers.onOpen?.()
        return
      }

      // Escape: Close dialogs, clear selection
      if (e.key === 'Escape') {
        handlers.onEscape?.()
        return
      }

      // Arrow navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        handlers.onNavigate?.('up')
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        handlers.onNavigate?.('down')
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlers.onNavigate?.('left')
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handlers.onNavigate?.('right')
        return
      }
    },
    [enabled, handlers, isMac]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])
}
