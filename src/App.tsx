import { useCallback, useEffect, useState } from 'react'
import { store, type Item } from './lib/store'
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
}

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

  const data: AppData = { items, loading, error, user, reload, setUser }

  return (
    <div className="app">
      {store.mode === 'demo' && (
        <div className="demo-banner">Demo mode: data is saved only in this browser. Connect Supabase to share it.</div>
      )}
      <main className="page">
        {error && <div className="error">Couldn't load homework: {error}</div>}
        {route === 'today' && <Today data={data} />}
        {route === 'calendar' && <Calendar data={data} />}
        {route === 'post' && <Post data={data} />}
        {!user && route !== 'post' && (
          <footer className="footer">
            <a href="#/post">Poster sign in</a>
          </footer>
        )}
      </main>
      <nav className="tabs">
        <a href="#/" className={route === 'today' ? 'active' : ''}>
          <span>📋</span>Today
        </a>
        <a href="#/calendar" className={route === 'calendar' ? 'active' : ''}>
          <span>🗓️</span>Calendar
        </a>
        {user && (
          <a href="#/post" className={route === 'post' ? 'active' : ''}>
            <span>✏️</span>Post
          </a>
        )}
      </nav>
    </div>
  )
}
