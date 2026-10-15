import type { Account } from './store'

/** UI guards complement, but never replace, Supabase authorization. */
export function canAccessRoute(account: Account | null, route: string) {
  if (!account) return false
  if (route === 'people') return account.role === 'admin'
  if (route === 'post') return account.role === 'editor' || account.role === 'admin'
  return true
}
