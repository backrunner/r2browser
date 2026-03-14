let tabBarDropResolver: ((screenX: number) => number) | null = null

export interface WindowTabMetrics {
  left: number
  width: number
  tabCount: number
}

export function calculateDropIndex(screenX: number, metrics: WindowTabMetrics): number {
  if (metrics.tabCount <= 0 || metrics.width <= 0) {
    return 0
  }

  const relativeX = screenX - metrics.left
  const tabWidth = metrics.width / metrics.tabCount

  return Math.min(
    Math.max(0, Math.round(relativeX / tabWidth)),
    metrics.tabCount
  )
}

export function registerTabBarDropResolver(resolver: (screenX: number) => number): () => void {
  tabBarDropResolver = resolver

  return () => {
    if (tabBarDropResolver === resolver) {
      tabBarDropResolver = null
    }
  }
}

export function resolveTabBarDropIndex(screenX: number): number | null {
  return tabBarDropResolver ? tabBarDropResolver(screenX) : null
}
