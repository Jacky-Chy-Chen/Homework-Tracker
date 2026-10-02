import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { ItemRow, SectionHeading, ThemeToggle, TopBar, Wordmark } from '../components/ui'
import { addDays, daysBetween, nextSchoolDay, todayISO } from '../lib/dates'
import { subjectColor, TYPE_LABEL } from '../lib/homework'
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
    <div className="signin">
      <div className="signin-top">
        <a href="#/" className="icon-btn quiet" aria-label="Back to today's homework">
          <Icon name="left" size={20} stroke={2} />
        </a>
        <ThemeToggle />
      </div>
      <div className="signin-body">
        <div className="stack gap-lg">
          <Wordmark big subtitle="" />
          <div className="stack">
            <h1>Sign in to post</h1>
            <p className="lead">Only the people who post homework need an account. Everyone else can just read.</p>
          </div>
        </div>
        <form className="signin-card" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {err && <div className="alert error">{err}</div>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <Icon name="arrow" size={18} stroke={2.2} />}
          </button>
        </form>
      </div>
      <p className="small faint center signin-foot">Classmates can read everything without signing in</p>
    </div>
  )
}

function Editor({ data }: { data: AppData }) {
  const [form, setForm] = useState<NewItem>(blank)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [typingSubject, setTypingSubject] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  // Every class on the timetable is offered as a subject, so the usual ones are
  // there from the start; anything typed by hand joins them.
  const subjects = useMemo(
    () => [...new Set([...data.timetable.flat(), ...data.items.map((i) => i.subject)].filter((s): s is string => !!s))].sort(),
    [data.timetable, data.items],
  )
  const today = todayISO()
  const current = data.items.filter((i) => i.due_date >= today)
  const past = data.items.filter((i) => i.due_date < today).reverse()
  // No subjects yet (first use) or a new one being typed: show the text box.
  const showSubjectInput = typingSubject || subjects.length === 0 || (form.subject !== '' && !subjects.includes(form.subject))
  const gap = daysBetween(form.assigned_date, form.due_date)

  const set = <K extends keyof NewItem>(k: K, v: NewItem[K]) => setForm((f) => ({ ...f, [k]: v }))

  const setType = (type: ItemType) =>
    setForm((f) => ({
      ...f,
      type,
      // Long-term work is rarely due tomorrow; nudge the default out a week.
      due_date: !editingId && type !== 'daily' && f.due_date === nextSchoolDay(f.assigned_date) ? addDays(f.assigned_date, 7) : f.due_date,
    }))

  const pickSubject = (s: string) => {
    setTypingSubject(false)
    set('subject', s)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.subject.trim()) {
      setErr('Pick a subject.')
      return
    }
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
      setTypingSubject(false)
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
    setTypingSubject(false)
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
    setTypingSubject(false)
    setForm(blank())
  }

  return (
    <>
      <TopBar editor />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow">{editingId ? 'Editing' : 'New entry'}</div>
          <h1>{editingId ? 'Edit item' : 'Add homework'}</h1>
        </div>
      </header>

      <div className="post-layout">
        <form className="form" onSubmit={submit}>
          <div className="field">
            <span className="field-label">Type</span>
            <div className="seg seg-4" role="radiogroup" aria-label="Type">
              {TYPES.map((t) => (
                <button type="button" role="radio" aria-checked={form.type === t} key={t} className={form.type === t ? 'on' : ''} onClick={() => setType(t)}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Subject</span>
            {subjects.length > 0 && (
              <div className="chips">
                {subjects.map((s) => {
                  const on = !typingSubject && form.subject === s
                  const c = subjectColor(s)
                  return (
                    <button
                      type="button"
                      key={s}
                      className={`chip ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      style={on ? { borderColor: c, background: `${c}24` } : undefined}
                      onClick={() => pickSubject(s)}
                    >
                      <span className="swatch" style={{ background: c }} />
                      {s}
                    </button>
                  )
                })}
                <button type="button" className={`chip chip-new ${showSubjectInput ? 'on' : ''}`} onClick={() => { setTypingSubject(true); set('subject', '') }}>
                  <Icon name="plus" size={12} stroke={2.4} />New
                </button>
              </div>
            )}
            {showSubjectInput && (
              <input
                aria-label="New subject"
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
                placeholder="Subject name, e.g. Physics"
                autoFocus={typingSubject}
              />
            )}
          </div>

          <label className="field">
            <span className="field-label">{form.type === 'daily' ? 'What to do' : 'Title'}</span>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={form.type === 'daily' ? 'Worksheet 3.2, #1–20' : form.type === 'test' ? 'Unit 2 test' : 'Group research project'}
              required
            />
          </label>

          <div className="stack gap-sm">
            <div className="two-col">
              <label className="field">
                <span className="field-label">Assigned</span>
                <input type="date" value={form.assigned_date} onChange={(e) => set('assigned_date', e.target.value)} required />
              </label>
              <label className="field">
                <span className="field-label">Due</span>
                <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} required />
              </label>
            </div>
            <span className={`hint-pill ${gap < 0 ? 'warn' : ''}`}>
              <Icon name="clock" size={14} stroke={2} />
              {gap < 0
                ? 'The due date is before the assigned date'
                : gap === 0
                  ? 'Due the same day'
                  : gap === 7 && form.type !== 'daily' && !editingId
                    ? 'One week from the assigned date'
                    : `${gap} day${gap === 1 ? '' : 's'} after it is assigned`}
            </span>
          </div>

          <label className="field">
            <span className="field-label">Notes <span className="faint">· optional</span></span>
            <textarea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Group size, what to bring, format…" />
          </label>

          <label className="field">
            <span className="field-label">Link <span className="faint">· optional</span></span>
            <input type="url" value={form.link ?? ''} onChange={(e) => set('link', e.target.value)} placeholder="https://" />
          </label>

          {err && <div className="alert error">{err}</div>}
          {flash && <div className="alert ok"><Icon name="check" size={16} stroke={2.2} />{flash}</div>}

          <div className="form-actions">
            {editingId && <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>}
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add to the board'}
              {!busy && <Icon name={editingId ? 'check' : 'arrow'} size={18} stroke={2.2} />}
            </button>
          </div>
        </form>

        <div className="stack gap-lg">
          <section className="stack">
            <SectionHeading count={current.length}>On the board</SectionHeading>
            {current.length === 0 ? (
              <div className="empty">Nothing due from today on.</div>
            ) : (
              <div className="row-list">
                {current.map((i) => <ItemRow key={i.id} item={i} onEdit={() => edit(i)} onDelete={() => remove(i)} />)}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="stack">
              <button className="btn-quiet past-toggle" onClick={() => setShowPast(!showPast)}>
                {showPast ? 'Hide' : 'Show'} past items ({past.length})
              </button>
              {showPast && (
                <div className="row-list">
                  {past.map((i) => <ItemRow key={i.id} item={i} onEdit={() => edit(i)} onDelete={() => remove(i)} />)}
                </div>
              )}
            </section>
          )}

          {store.mode === 'supabase' && (
            <div className="signout-row mobile-only">
              Signed in as {data.user}
              <button className="link-btn" onClick={data.signOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
