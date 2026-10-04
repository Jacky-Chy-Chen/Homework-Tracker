import { useEffect, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { SectionHeading, TopBar } from '../components/ui'
import { store, type Account, type Role } from '../lib/store'

const ROLES: { value: Role; label: string; what: string }[] = [
  { value: 'reader', label: 'Reader', what: 'Can read the site. Cannot change anything.' },
  { value: 'editor', label: 'Editor', what: 'Can post homework, change the timetable and upload files.' },
  { value: 'admin', label: 'Admin', what: 'Everything an editor can do, and can set these permissions.' },
]

/** The admin's page: who has an account, and what each of them may do. */
export default function People({ data }: { data: AppData }) {
  const [people, setPeople] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      setPeople(await store.people())
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const change = async (person: Account, role: Role) => {
    if (person.role === role) return
    setBusy(person.id)
    setErr(null)
    try {
      await store.setRole(person.id, role)
      setPeople((list) => list.map((p) => (p.id === person.id ? { ...p, role } : p)))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const editors = people.filter((p) => p.role !== 'reader')

  return (
    <>
      <TopBar editor />

      <header className="page-head" data-tour="people">
        <div className="page-head-text">
          <div className="eyebrow">{people.length} with an account · {editors.length} can post</div>
          <h1>People</h1>
        </div>
      </header>

      <p className="lead" style={{ maxWidth: 620 }}>
        Anyone can sign up with their email, and a new account can only read. Make someone an editor and they can post
        homework, change the timetable and upload files. They see the change the next time they open the site.
      </p>

      {err && <div className="alert error">{err}</div>}

      <section className="stack" style={{ marginTop: 20 }}>
        <SectionHeading count={people.length}>Accounts</SectionHeading>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : people.length === 0 ? (
          <div className="empty">Nobody has signed up yet.</div>
        ) : (
          people.map((p) => (
            <div key={p.id} className="card person-card">
              <div className="person-who">
                <strong>{p.name || p.email}</strong>
                {p.name && <span className="small faint">{p.email}</span>}
                {p.id === data.user?.id && <span className="small muted">This is you</span>}
              </div>
              <div className="seg seg-3 person-roles" role="radiogroup" aria-label={`What ${p.email} may do`}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    role="radio"
                    aria-checked={p.role === r.value}
                    className={p.role === r.value ? 'on' : ''}
                    disabled={busy === p.id || p.id === data.user?.id}
                    title={p.id === data.user?.id ? 'You cannot change your own permissions' : r.what}
                    onClick={() => change(p, r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="stack" style={{ marginTop: 28 }}>
        <SectionHeading>What each one means</SectionHeading>
        <div className="card stack gap-sm">
          {ROLES.map((r) => (
            <p key={r.value} className="small">
              <strong>{r.label}</strong> — {r.what}
            </p>
          ))}
          <p className="small muted">
            <Icon name="user" size={13} stroke={1.8} /> You cannot change your own permissions, so an admin can never lock
            themselves out.
          </p>
        </div>
      </section>
    </>
  )
}
