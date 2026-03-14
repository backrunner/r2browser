export interface SearchFilters {
  fileTypes: {
    images: boolean
    documents: boolean
    audio: boolean
    video: boolean
    archives: boolean
    folders: boolean
  }
  sizeFilter: {
    enabled: boolean
    operator: 'lt' | 'gt' | 'between'
    minSize: number
    maxSize: number
    unit: 'KB' | 'MB' | 'GB'
  }
  dateFilter: {
    enabled: boolean
    period: 'today' | '7days' | '30days' | '90days' | 'year'
  }
}

export const defaultFilters: SearchFilters = {
  fileTypes: {
    images: true,
    documents: true,
    audio: true,
    video: true,
    archives: true,
    folders: true,
  },
  sizeFilter: {
    enabled: false,
    operator: 'lt',
    minSize: 0,
    maxSize: 100,
    unit: 'MB',
  },
  dateFilter: {
    enabled: false,
    period: '30days',
  },
}

const FILE_TYPE_EXTENSIONS: Record<keyof SearchFilters['fileTypes'], string[]> = {
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif'],
  documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
  video: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv', 'flv'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  folders: [],
}

export function countActiveFilters(filters: SearchFilters): number {
  let count = 0

  const disabledTypes = Object.values(filters.fileTypes).filter((value) => !value).length
  if (disabledTypes > 0) count += 1
  if (filters.sizeFilter.enabled) count += 1
  if (filters.dateFilter.enabled) count += 1

  return count
}

function sizeToBytes(size: number, unit: 'KB' | 'MB' | 'GB'): number {
  const multipliers = {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  }

  return size * multipliers[unit]
}

function getDateThreshold(period: SearchFilters['dateFilter']['period']): Date {
  const now = new Date()

  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case '7days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90days':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    default:
      return new Date(0)
  }
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : ''
}

function getFileTypeCategory(filename: string, isFolder: boolean): keyof SearchFilters['fileTypes'] | null {
  if (isFolder) return 'folders'

  const extension = getFileExtension(filename)
  for (const [category, extensions] of Object.entries(FILE_TYPE_EXTENSIONS)) {
    if (extensions.includes(extension)) {
      return category as keyof SearchFilters['fileTypes']
    }
  }

  return null
}

export function applySearchFilters<T extends { name: string; type: 'file' | 'folder'; size?: number; lastModified?: Date | string }>(
  files: T[],
  searchQuery: string,
  filters: SearchFilters
): T[] {
  return files.filter((file) => {
    if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    const category = getFileTypeCategory(file.name, file.type === 'folder')
    if (category && !filters.fileTypes[category]) {
      return false
    }

    if (filters.sizeFilter.enabled && file.type === 'file' && file.size !== undefined) {
      const minBytes = filters.sizeFilter.operator === 'between'
        ? sizeToBytes(filters.sizeFilter.minSize, filters.sizeFilter.unit)
        : 0
      const maxBytes = sizeToBytes(filters.sizeFilter.maxSize, filters.sizeFilter.unit)

      switch (filters.sizeFilter.operator) {
        case 'lt':
          if (file.size >= maxBytes) return false
          break
        case 'gt':
          if (file.size <= maxBytes) return false
          break
        case 'between':
          if (file.size < minBytes || file.size > maxBytes) return false
          break
      }
    }

    if (filters.dateFilter.enabled && file.lastModified) {
      const fileDate = typeof file.lastModified === 'string'
        ? new Date(file.lastModified)
        : file.lastModified
      const threshold = getDateThreshold(filters.dateFilter.period)

      if (fileDate < threshold) {
        return false
      }
    }

    return true
  })
}
