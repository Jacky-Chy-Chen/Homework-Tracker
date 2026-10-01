import { useCallback, useEffect, useState } from 'react'
import { store, type Item, type Material, type Timetable } from './lib/store'
import { DEFAULT_TIMETABLE, type SlotChange } from './lib/schedule'
import { addDays, todayISO } from './lib/dates'
import Icon, { type IconName } from './components/Icon'
import { ThemeToggle, Wordmark } from './components/ui'
import Today from './pages/Today'
import Schedule from './pages/Schedule'
import Materials from './pages/Materials'
import Post from './pages/Post'

// Hash routing: works on any static host and inside WeChat's browser.
type Route = 'today' | 'schedule' | 'materials' | 'post'
const ROUTES: Route[] = ['today', 'schedule', 'materials', 'post']
const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0] as Route
  return ROUTES.includes(r) ? r : 'today'
}

export interface AppData {
  items: Item[]
  materials: Material[]
  timetable: Timetable
  changes: SlotChange[]
  loading: boolean
  error: string | null
  user: string | null
  reload: () => Promise<void>
  reloadSchedule: () => Promise<void>
  reloadMaterials: () => Promise<void>
  setUser: (u: string | null) => void
  signOut: () => Promise<void>
}

const NAV: { route: Route; href: string; label: string; icon: IconName; editorOnly?: boolean }[] = [
  { route: 'today', href: '#/', label: 'Today', icon: 'today' },
  { route: 'schedule', href: '#/schedule', label: 'Classes', icon: 'grid' },
  { route: 'materials', href: '#/materials', label: 'Files', icon: 'folder' },
  { route: 'post', href: '#/post', label: 'Add', icon: 'plus', editorOnly: true },
]

const TITLES: Record<Route, string> = {
  today: 'Classboard',
  schedule: 'Classes · Classboard',
  materials: 'Files · Classboard',
  post: 'Add homework · Classboard',
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [items, setItems] = useState<Item[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [timetable, setTimetable] = useState<Timetable>(DEFAULT_TIMETABLE)
  const [changes, setChanges] = useState<SlotChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<string | null>(null)

  const fail = (e: unknown) => setError((e as Error).message)

  const reload = useCallback(async () => {
    try {
      setItems(await store.list())
      setError(null)
    } catch (e) {
      fail(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadSchedule = useCallback(async () => {
    try {
      // Keep a month of history so past weeks still show what actually happened.
      const [grid, rows] = await Promise.all([store.timetable(), store.changes(addDays(todayISO(), -31))])
      setTimetable(grid)
      setChanges(rows)
    } catch (e) {
      fail(e)
    }
  }, [])

  const reloadMaterials = useCallback(async () => {
    try {
      setMaterials(await store.materials())
    } catch (e) {
      fail(e)
    }
  }, [])

  useEffect(() => {
    // The calendar used to be its own page; old links keep working.
    const legacy = () => {
      const m = location.hash.match(/^#\/calendar(\?.*)?$/)
      if (m) location.replace(`#/${m[1] ?? ''}`)
    }
    legacy()
    const onHash = () => {
      legacy()
      setRoute(readRoute())
    }
    window.addEventListener('hashchange', onHash)
    reload()
    reloadSchedule()
    reloadMaterials()
    store.currentUser().then(setUser)
    return () => window.removeEventListener('hashchange', onHash)
  }, [reload, reloadSchedule, reloadMaterials])

  useEffect(() => {
    document.title = TITLES[route]
    window.scrollTo(0, 0)
  }, [route])

  const signOut = async () => {
    await store.signOut()
    setUser(null)
    location.hash = '#/'
  }

  const data: AppData = {
    items, materials, timetable, changes, loading, error, user,
    reload, reloadSchedule, reloadMaterials, setUser, signOut,
  }
  const nav = NAV.filter((n) => !n.editorOnly || user)
  // The sign-in screen is full-bleed with no navigation.
  const signingIn = route === 'post' && !user

  return (
    <div className={`app ${signingIn ? 'no-nav' : ''}`}>
      {store.mode === 'demo' && (
        <div className="demo-banner">Demo mode · saved only in this browser</div>
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
          <div className="sidebar-bottom">
            <ThemeToggle row />
            {user && store.mode === 'supabase' ? (
              <div className="sidebar-user">
                <span className="pill-editor"><span className="dot" />Signed in as editor</span>
                <button className="link-btn" onClick={signOut}>Sign out</button>
              </div>
            ) : !user ? (
              <a className="sidebar-user" href="#/post">Sign in to post</a>
            ) : null}
          </div>
        </aside>
      )}

      <main className={`page page-${route}`}>
        {error && <div className="alert error">Something went wrong: {error}</div>}
        {route === 'today' && <Today data={data} />}
        {route === 'schedule' && <Schedule data={data} />}
        {route === 'materials' && <Materials data={data} />}
        {route === 'post' && <Post data={data} />}
        {!user && route !== 'post' && (
          <footer className="footer">
            <a href="#/post">
              Sign in to post <Icon name="arrow" size={14} stroke={2} />
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
