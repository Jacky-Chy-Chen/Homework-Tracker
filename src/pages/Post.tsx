import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import ItemCard from '../components/ItemCard'
import { addDays, fmtShort, nextSchoolDay, todayISO } from '../lib/dates'
import { TYPE_LABEL } from '../lib/homework'
import { store, type Item, type ItemType, type NewItem } from '../lib/store'

const TYPES: ItemType[] = ['daily', 'project', 'test', 'other']

const blank = (): NewItem => {
  const t = todayISO()
  return { title: '', subject: '', type: 'daily', assigned_date: t, due_date: nextSchoolDay(t), notes: null, link: null }
}

export default function Post({ data }: { data: AppData }) {
  if (!data.user) return <SignIn onSignedIn={data.setUser} />
  return <Editor data={data} />
}

function SignIn({ onSignedIn }: { onSignedIn: (u: string | null) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await store.signIn(email.trim(), password)
      onSignedIn(await store.currentUser())
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form narrow" onSubmit={submit}>
      <h1>Sign in to post</h1>
      <p className="muted">Only the homework poster needs an account. Everyone else can just read.</p>
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {err && <div className="error">{err}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}

function Editor({ data }: { data: AppData }) {
  const [form, setForm] = useState<NewItem>(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  const subjects = useMemo(() => [...new Set(data.items.map((i) => i.subject))].sort(), [data.items])
  const today = todayISO()
  const current = data.items.filter((i) => i.due_date >= today)
  const past = data.items.filter((i) => i.due_date < today).reverse()

  const set = <K extends keyof NewItem>(k: K, v: NewItem[K]) => setForm((f) => ({ ...f, [k]: v }))

  const setType = (type: ItemType) =>
    setForm((f) => ({
      ...f,
      type,
      // Long-term work is rarely due tomorrow; nudge the default out a week.
      due_date: !editingId && type !== 'daily' && f.due_date === nextSchoolDay(f.assigned_date) ? addDays(f.assigned_date, 7) : f.due_date,
    }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.due_date < form.assigned_date) {
      setErr('Due date is before the assigned date.')
      return
    }
    setBusy(true)
    setErr(null)
    const clean: NewItem = {
      ...form,
      title: form.title.trim(),
      subject: form.subject.trim(),
      notes: form.notes?.trim() || null,
      link: form.link?.trim() || null,
    }
    try {
      if (editingId) await store.update(editingId, clean)
      else await store.add(clean)
      await data.reload()
      setFlash(editingId ? 'Saved changes' : `Added ${clean.subject}: ${clean.title}`)
      setTimeout(() => setFlash(null), 2500)
      // Keep type and dates so posting several subjects in a row is quick.
      setForm((f) => ({ ...blank(), type: f.type, assigned_date: f.assigned_date, due_date: f.due_date }))
      setEditingId(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const edit = (i: Item) => {
    const { id, ...rest } = i
    setEditingId(id)
    setForm(rest)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (i: Item) => {
    if (!confirm(`Delete "${i.subject}: ${i.title}"?`)) return
    try {
      await store.remove(i.id)
      await data.reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(blank())
  }

  const actions = (i: Item) => (
    <>
      <button className="text-btn" onClick={() => edit(i)}>Edit</button>
      <button className="text-btn danger" onClick={() => remove(i)}>Delete</button>
    </>
  )

  return (
    <>
      <form className="form" onSubmit={submit}>
        <h1>{editingId ? 'Edit item' : 'Post homework'}</h1>

        <div className="seg" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => (
            <button type="button" key={t} className={form.type === t ? 'on' : ''} onClick={() => setType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <label>
          Subject
          <input list="subjects" value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Math" required />
          <datalist id="subjects">
            {subjects.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>

        <label>
          {form.type === 'daily' ? 'What to do' : 'Title'}
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={form.type === 'daily' ? 'Worksheet 3.2, #1–20' : 'Group research project'} required />
        </label>

        <div className="row">
          <label>
            Assigned
            <input type="date" value={form.assigned_date} onChange={(e) => set('assigned_date', e.target.value)} required />
          </label>
          <label>
            Due
            <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} required />
          </label>
        </div>

        <label>
          Notes <span className="muted">(optional)</span>
          <textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Groups of 4, bring printed copy…" />
        </label>

        <label>
          Link <span className="muted">(optional)</span>
          <input type="url" value={form.link ?? ''} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
        </label>

        {err && <div className="error">{err}</div>}
        {flash && <div className="flash">✓ {flash}</div>}

        <div className="row buttons">
          {editingId && <button type="button" onClick={cancelEdit}>Cancel</button>}
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add'}</button>
        </div>
      </form>

      <section>
        <h2>Current ({current.length})</h2>
        {current.length === 0 && <div className="empty">Nothing due from today on.</div>}
        {current.map((i) => (
          <ItemCard key={i.id} item={i} actions={actions(i)} />
        ))}
      </section>

      <section>
        <button className="text-btn" onClick={() => setShowPast(!showPast)}>
          {showPast ? 'Hide' : 'Show'} past items ({past.length})
        </button>
        {showPast && past.map((i) => <ItemCard key={i.id} item={i} actions={actions(i)} />)}
      </section>

      {store.mode === 'supabase' && (
        <p className="muted small">
          Signed in as {data.user} ·{' '}
          <button className="text-btn" onClick={async () => { await store.signOut(); data.setUser(null); location.hash = '#/' }}>
            Sign out
          </button>
        </p>
      )}
      <p className="muted small">Tip: assigned {fmtShort(today)} is today; due defaults to the next school day.</p>
    </>
  )
}
