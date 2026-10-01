import { useSyncExternalStore } from 'react'

// Ticked-off homework is personal: it stays in the student's own browser and is never shared.
const KEY = 'hw-done'
const listeners = new Set<() => void>()

let cache: string[] | null = null

const load = (): string[] => {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    cache = []
  }
  return cache!
}

export function toggleDone(id: string) {
  const next = load().includes(id) ? load().filter((x) => x !== id) : [...load(), id]
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach((l) => l())
}

/** The set of ticked ids; components re-render when any of them changes. */
export function useDone() {
  const ids = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, load)
  return new Set(ids)
}
