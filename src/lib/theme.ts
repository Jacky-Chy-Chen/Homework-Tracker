import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'hw-theme'
const listeners = new Set<() => void>()

/** index.html sets data-theme before first paint (saved choice, else the device setting). */
const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {}
  listeners.forEach((l) => l())
}

/** Current theme; every toggle on screen re-renders when it changes. */
export function useTheme() {
  return useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, read)
}
