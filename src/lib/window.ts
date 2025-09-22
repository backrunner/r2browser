import { invoke } from '@tauri-apps/api/core'

export async function windowMinimize(): Promise<void> {
  await invoke('window_minimize')
}

export async function windowToggleMaximize(): Promise<boolean> {
  return invoke<boolean>('window_toggle_maximize')
}

export async function windowClose(): Promise<void> {
  await invoke('window_close')
}

export async function windowIsMaximized(): Promise<boolean> {
  return invoke<boolean>('window_is_maximized')
}

export async function windowStartDragging(): Promise<void> {
  await invoke('window_start_dragging')
}

