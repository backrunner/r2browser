import { Icon, IconProps } from '@iconify/react'
import { cn } from '@/lib/utils'

interface IconifyIconProps extends Omit<IconProps, 'icon'> {
  icon: string
  className?: string
}

export function IconifyIcon({ icon, className, ...props }: IconifyIconProps) {
  return (
    <Icon
      icon={icon}
      className={cn("h-4 w-4", className)}
      {...props}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const Icons = {
  // File and folder icons
  folder: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:folder" {...props} />
  ),
  folderOpen: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:folder-open" {...props} />
  ),
  file: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:file" {...props} />
  ),
  fileText: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:file-text" {...props} />
  ),
  image: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:image" {...props} />
  ),
  video: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:video" {...props} />
  ),
  music: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:music" {...props} />
  ),

  // Navigation icons
  home: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:home" {...props} />
  ),
  back: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:arrow-left" {...props} />
  ),
  forward: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:arrow-right" {...props} />
  ),
  up: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:arrow-up" {...props} />
  ),
  refresh: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:refresh-cw" {...props} />
  ),

  // Action icons
  upload: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:upload" {...props} />
  ),
  download: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:download" {...props} />
  ),
  delete: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:trash-2" {...props} />
  ),
  edit: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:edit" {...props} />
  ),
  copy: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:copy" {...props} />
  ),
  move: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:move" {...props} />
  ),
  pause: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:pause" {...props} />
  ),
  play: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:play" {...props} />
  ),

  // UI icons
  plus: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:plus" {...props} />
  ),
  minus: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:minus" {...props} />
  ),
  x: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:x" {...props} />
  ),
  check: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:check" {...props} />
  ),
  settings: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:settings" {...props} />
  ),
  menu: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:menu" {...props} />
  ),
  moreHorizontal: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:more-horizontal" {...props} />
  ),
  moreVertical: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:more-vertical" {...props} />
  ),

  // Cloud/storage icons
  cloud: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:cloud" {...props} />
  ),
  server: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:server" {...props} />
  ),
  database: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:database" {...props} />
  ),

  // Status icons
  loading: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:loader-2" {...props} />
  ),
  warning: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:alert-triangle" {...props} />
  ),
  error: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:alert-circle" {...props} />
  ),
  info: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:info" {...props} />
  ),

  // Layout icons
  splitHorizontal: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:split-horizontal" {...props} />
  ),
  splitVertical: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:split-vertical" {...props} />
  ),
  maximize: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:maximize" {...props} />
  ),
  minimize: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:minimize" {...props} />
  ),

  // View icons
  grid: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:grid-3x3" {...props} />
  ),
  list: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:list" {...props} />
  ),
  eye: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:eye" {...props} />
  ),
  eyeOff: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:eye-off" {...props} />
  ),

  // Search and filter
  search: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:search" {...props} />
  ),
  filter: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:filter" {...props} />
  ),
  sort: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:arrow-up-down" {...props} />
  ),

  // Time and clock
  clock: (props: Omit<IconifyIconProps, 'icon'>) => (
    <IconifyIcon icon="lucide:clock" {...props} />
  ),
}

export { IconifyIcon as Icon }