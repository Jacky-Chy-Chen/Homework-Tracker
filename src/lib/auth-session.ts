import type { Account } from './store'

export interface AuthSource {
  currentUser(): Promise<Account | null>
  subscribeAuth(listener: (signedIn: boolean) => void): () => void
  signOut(): Promise<void>
}

export interface AuthSnapshot {
  status: 'checking' | 'signed-out' | 'signed-in'
  user: Account | null
  error: string | null
}

/** One fail-closed boundary. Stale profile requests cannot restore a signed-out user. */
export function createAuthSession(source: AuthSource, onSignedIn: () => void) {
  let snapshot: AuthSnapshot = { status: 'checking', user: null, error: null }
  const listeners = new Set<() => void>()
  let active = false
  let revision = 0
  let lastUserId: string | null = null
  let blocked = false
  let signingOut = false
  let pending: ReturnType<typeof setTimeout> | undefined
  const publish = (next: AuthSnapshot) => {
    snapshot = next
    listeners.forEach(listener => listener())
  }
  const cancel = () => {
    revision++
    clearTimeout(pending)
  }
  const refresh = async () => {
    if (blocked || signingOut) return
    cancel()
    const request = revision
    publish({ status: 'checking', user: null, error: null })
    try {
      const user = await source.currentUser()
      if (!active || request !== revision) return
      if (user && user.id !== lastUserId) onSignedIn()
      lastUserId = user?.id ?? null
      publish({ status: user ? 'signed-in' : 'signed-out', user, error: null })
    } catch {
      if (!active || request !== revision) return
      lastUserId = null
      publish({ status: 'signed-out', user: null, error: 'Could not check your session. Please try signing in again.' })
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    refresh() { blocked = false; return refresh() },
    start() {
      active = true
      const unsubscribe = source.subscribeAuth(signedIn => {
        if (!active || (signedIn && blocked)) return
        cancel()
        if (!signedIn) {
          lastUserId = null
          publish({ status: 'signed-out', user: null, error: null })
          return
        }
        // Supabase auth callbacks must stay synchronous. Query the profile later,
        // outside its internal auth lock, and hide old content immediately.
        publish({ status: 'checking', user: null, error: null })
        pending = setTimeout(() => { void refresh() }, 0)
      })
      void refresh()
      return () => { active = false; cancel(); unsubscribe() }
    },
    async signOut() {
      blocked = true
      signingOut = true
      cancel()
      lastUserId = null
      publish({ status: 'checking', user: null, error: null })
      try {
        await source.signOut()
        if (!active) return
        cancel()
        publish({ status: 'signed-out', user: null, error: null })
      } catch {
        if (!active) return
        cancel()
        publish({ status: 'signed-out', user: null, error: 'Sign out could not finish. Please retry before leaving this device.' })
      } finally { signingOut = false }
    },
  }
}
