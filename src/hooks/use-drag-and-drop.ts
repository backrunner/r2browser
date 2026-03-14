import React, { useState, useRef } from 'react'
import { FileItem } from '@/types'

interface DragState {
  isDragging: boolean
  draggedFiles: FileItem[]
  dragOverTarget: string | null
}

interface UseDragAndDropOptions {
  onFilesMove?: (files: FileItem[], targetPath: string) => void
  onFilesDrop?: (files: File[], targetPath: string) => void
}

export function useDragAndDrop({ onFilesMove, onFilesDrop }: UseDragAndDropOptions) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedFiles: [],
    dragOverTarget: null,
  })

  const dragCounter = useRef(0)
  const draggedFilesRef = useRef<FileItem[]>([])

  const handleDragStart = (files: FileItem[]) => {
    draggedFilesRef.current = files
    setDragState({
      isDragging: true,
      draggedFiles: files,
      dragOverTarget: null,
    })
  }

  const handleDragEnd = () => {
    draggedFilesRef.current = []
    dragCounter.current = 0
    setDragState({
      isDragging: false,
      draggedFiles: [],
      dragOverTarget: null,
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault()
    dragCounter.current++

    if (dragCounter.current === 1) {
      setDragState(prev => ({
        ...prev,
        dragOverTarget: targetPath,
      }))
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--

    if (dragCounter.current === 0) {
      setDragState(prev => ({
        ...prev,
        dragOverTarget: null,
      }))
    }
  }

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    if (e.defaultPrevented && e.target !== e.currentTarget) {
      return
    }

    e.preventDefault()
    dragCounter.current = 0

    // Handle file drops from external sources (file system)
    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      onFilesDrop?.(files, targetPath)
    }
    // Handle internal file moves
    else if (draggedFilesRef.current.length > 0) {
      onFilesMove?.(draggedFilesRef.current, targetPath)
    }

    handleDragEnd()
  }

  const getDragProps = (targetPath: string) => ({
    onDragOver: handleDragOver,
    onDragEnter: (e: React.DragEvent) => handleDragEnter(e, targetPath),
    onDragLeave: handleDragLeave,
    onDrop: (e: React.DragEvent) => handleDrop(e, targetPath),
  })

  const getDraggableProps = (files: FileItem[]) => ({
    draggable: true,
    onDragStart: () => handleDragStart(files),
    onDragEnd: handleDragEnd,
  })

  const isDropTarget = (targetPath: string) => {
    return dragState.dragOverTarget === targetPath
  }

  const isDraggedFile = (file: FileItem) => {
    return dragState.draggedFiles.some(f => f.key === file.key)
  }

  return {
    dragState,
    getDragProps,
    getDraggableProps,
    isDropTarget,
    isDraggedFile,
    handleDragEnd,
  }
}
