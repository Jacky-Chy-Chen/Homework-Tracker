import { useCallback, useEffect, useState } from 'react'
import { store, type Item } from './lib/store'
import Icon, { type IconName } from './components/Icon'
import { Wordmark } from './components/ui'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import Post from './pages/Post'

// Hash routing: works on any static host and inside WeChat's browser.
type Route = 'today' | 'calendar' | 'post'
const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0]
  return r === 'calendar' || r === 'post' ? r : 'today'
}

export interface AppData {
  items: Item[]
  loading: boolean
  error: string | null
  user: string | null
  reload: () => Promise<void>
  setUser: (u: string | null) => void
  signOut: () => Promise<void>
}

const NAV: { route: Route; href: string; label: string; icon: IconName; posterOnly?: boolean }[] = [
  { route: 'today', href: '#/', label: 'Today', icon: 'today' },
  { route: 'calendar', href: '#/calendar', label: 'Calendar', icon: 'calendar' },
  { route: 'post', href: '#/post', label: 'Post', icon: 'plus', posterOnly: true },
]

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setItems(await store.list())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    reload()
    store.currentUser().then(setUser)
    return () => window.removeEventListener('hashchange', onHash)
  }, [reload])

  useEffect(() => {
    document.title = { today: 'Homework', calendar: 'Calendar · Homework', post: 'Post · Homework' }[route]
    window.scrollTo(0, 0)
  }, [route])

  const signOut = async () => {
    await store.signOut()
    setUser(null)
    location.hash = '#/'
  }

  const data: AppData = { items, loading, error, user, reload, setUser, signOut }
  const nav = NAV.filter((n) => !n.posterOnly || user)
  // The sign-in screen is full-bleed with no navigation.
  const signingIn = route === 'post' && !user

  return (
    <div className={`app ${signingIn ? 'no-nav' : ''}`}>
      {store.mode === 'demo' && (
        <div className="demo-banner mono">DEMO MODE · data is saved only in this browser</div>
      )}

      {!signingIn && (
        <aside className="sidebar">
          <a href="#/" className="sidebar-brand"><Wordmark /></a>
          <nav className="sidebar-nav">
            {nav.map((n) => (
              <a key={n.route} href={n.href} className={route === n.route ? 'active' : ''}>
                <Icon name={n.icon} size={18} stroke={1.8} />
                {n.label}
              </a>
            ))}
          </nav>
          {user && store.mode === 'supabase' ? (
            <div className="sidebar-user">
              <span className="mono accent xsmall"><span className="dot" />SIGNED IN AS POSTER</span>
              <button className="link-btn" onClick={signOut}>Sign out</button>
            </div>
          ) : !user ? (
            <a className="sidebar-user mono muted small" href="#/post">Poster sign in →</a>
          ) : null}
        </aside>
      )}

      <main className={`page page-${route}`}>
        {error && <div className="alert error">Couldn't load homework: {error}</div>}
        {route === 'today' && <Today data={data} />}
        {route === 'calendar' && <Calendar data={data} />}
        {route === 'post' && <Post data={data} />}
        {!user && route !== 'post' && (
          <footer className="footer">
            <a href="#/post" className="mono">
              Poster sign in <Icon name="arrow" size={14} stroke={2} />
            </a>
          </footer>
        )}
      </main>

      {!signingIn && (
        <nav className="tabs">
          {nav.map((n) => (
            <a key={n.route} href={n.href} className={route === n.route ? 'active' : ''}>
              <Icon name={n.icon} size={22} stroke={1.8} />
              {n.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
