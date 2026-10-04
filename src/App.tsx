import { useCallback, useEffect, useState } from 'react'
import { canEdit, isAdmin, store, type Account, type Item, type Material, type Timetable } from './lib/store'
import { DEFAULT_TIMETABLE, type SlotChange } from './lib/schedule'
import { addDays, todayISO } from './lib/dates'
import Icon, { type IconName } from './components/Icon'
import { ThemeToggle, Wordmark } from './components/ui'
import Today from './pages/Today'
import Schedule from './pages/Schedule'
import Materials from './pages/Materials'
import Post from './pages/Post'
import People from './pages/People'
import Tour, { tourSeen } from './components/Tour'

// Hash routing: works on any static host and inside WeChat's browser.
type Route = 'today' | 'schedule' | 'materials' | 'post' | 'people'
const ROUTES: Route[] = ['today', 'schedule', 'materials', 'post', 'people']
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
  /** The signed-in account, or null. `editor` says whether it may write. */
  user: Account | null
  editor: boolean
  admin: boolean
  reload: () => Promise<void>
  reloadSchedule: () => Promise<void>
  reloadMaterials: () => Promise<void>
  setUser: (u: Account | null) => void
  signOut: () => Promise<void>
}

const NAV: { route: Route; href: string; label: string; icon: IconName; editorOnly?: boolean; adminOnly?: boolean }[] = [
  { route: 'today', href: '#/', label: 'Today', icon: 'today' },
  { route: 'schedule', href: '#/schedule', label: 'Classes', icon: 'grid' },
  { route: 'materials', href: '#/materials', label: 'Files', icon: 'folder' },
  { route: 'post', href: '#/post', label: 'Add', icon: 'plus', editorOnly: true },
  { route: 'people', href: '#/people', label: 'People', icon: 'user', adminOnly: true },
]

const TITLES: Record<Route, string> = {
  today: 'Classboard',
  schedule: 'Classes · Classboard',
  materials: 'Files · Classboard',
  post: 'Add homework · Classboard',
  people: 'People · Classboard',
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [items, setItems] = useState<Item[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [timetable, setTimetable] = useState<Timetable>(DEFAULT_TIMETABLE)
  const [changes, setChanges] = useState<SlotChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<Account | null>(null)
  // The guide opens itself the first time someone lands here, and lives behind
  // the Guide button after that.
  const [tour, setTour] = useState(() => !tourSeen())

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
    const openGuide = () => setTour(true)
    window.addEventListener('classboard:guide', openGuide)
    window.addEventListener('hashchange', onHash)
    reload()
    reloadSchedule()
    reloadMaterials()
    store.currentUser().then(setUser)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('classboard:guide', openGuide)
    }
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
    editor: canEdit(user), admin: isAdmin(user),
    reload, reloadSchedule, reloadMaterials, setUser, signOut,
  }
  const editor = canEdit(user)
  const nav = NAV.filter((n) => (!n.editorOnly || editor) && (!n.adminOnly || isAdmin(user)))
  // The sign-in screen is full-bleed with no navigation.
  const signingIn = route === 'post' && !editor

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
            <button className="theme-row" data-tour="help" onClick={() => setTour(true)}>
              <Icon name="help" size={18} stroke={1.8} />
              Guide
            </button>
            <ThemeToggle row />
            {user ? (
              <div className="sidebar-user">
                <span className="pill-editor">
                  <span className="dot" />
                  {user.role === 'admin' ? 'Admin' : user.role === 'editor' ? 'Editor' : 'Reader'}
                </span>
                <span className="small faint">{user.name || user.email}</span>
                <button className="link-btn" onClick={signOut}>Sign out</button>
              </div>
            ) : (
              <a className="sidebar-user" href="#/post">Sign in</a>
            )}
          </div>
        </aside>
      )}

      <main className={`page page-${route}`}>
        {error && <div className="alert error">Something went wrong: {error}</div>}
        {route === 'today' && <Today data={data} />}
        {route === 'schedule' && <Schedule data={data} />}
        {route === 'materials' && <Materials data={data} />}
        {route === 'post' && <Post data={data} />}
        {route === 'people' && <People data={data} />}
        {!editor && route !== 'post' && (
          <footer className="footer">
            <a href="#/post">
              {user ? 'Your account' : 'Sign in or sign up'} <Icon name="arrow" size={14} stroke={2} />
            </a>
          </footer>
        )}
      </main>

      {tour && !signingIn && <Tour editor={editor} admin={isAdmin(user)} onClose={() => setTour(false)} />}

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
