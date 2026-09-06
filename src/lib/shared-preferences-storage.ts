import { createJSONStorage } from 'zustand/middleware'

interface PersistedPreferences {
  state: Record<string, unknown>
  version?: number
}

/** Ignore unrelated store writes and merge only preferences changed by this window. */
export function sharedPreferencesStorage<T>() {
  const snapshots = new Map<string, string>()
  return createJSONStorage<T>(() => ({
    getItem: key => {
      const value = localStorage.getItem(key)
      if (value !== null) snapshots.set(key, value)
      return value
    },
    setItem: (key, value) => {
      const previous = snapshots.get(key)
      if (previous === value) return
      const next = JSON.parse(value) as PersistedPreferences
      let merged = next
      if (previous) {
        const prior = JSON.parse(previous) as PersistedPreferences
        const current = JSON.parse(localStorage.getItem(key) ?? value) as PersistedPreferences
        const changes = Object.fromEntries(Object.entries(next.state).filter(([name, item]) => JSON.stringify(item) !== JSON.stringify(prior.state[name])))
        merged = { ...next, state: { ...current.state, ...changes } }
      }
      snapshots.set(key, value)
      localStorage.setItem(key, JSON.stringify(merged))
    },
    removeItem: key => { snapshots.delete(key); localStorage.removeItem(key) },
  }))
}
