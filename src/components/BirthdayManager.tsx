import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../App'
import { canManageNews, validateBirthday, type Birthday, type NewBirthday } from '../lib/news'
import { store } from '../lib/store'
import Icon from './Icon'
import { SectionHeading } from './ui'

const blank = (): NewBirthday => ({ display_name: '', birth_month: 1, birth_day: 1, consent_given: false, visible: false })
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export default function BirthdayManager({ data }: { data: AppData }) {
  const [records, setRecords] = useState<Birthday[]>([])
  const [form, setForm] = useState<NewBirthday>(blank)
  const [editing, setEditing] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    if (!canManageNews(data.user)) { setRecords([]); setLoading(false); return }
    store.news.birthdays().then(rows => { if (active) setRecords(rows) }).catch(e => { if (active) setErr((e as Error).message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [data.user?.id, data.user?.role, data.user?.news_manager])
  if (!canManageNews(data.user)) return null
  const reset = () => { setForm(blank()); setEditing(undefined) }
  const refresh = async () => {
    try { setRecords(await store.news.birthdays()); await data.reloadNews() }
    catch (e) { setErr((e as Error).message) }
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setFlash(null)
    try {
      validateBirthday(form); await store.news.saveBirthday(form, editing); reset(); setFlash('Birthday settings saved. Only permitted, enabled greetings will appear on the birthday.')
    } catch (e) { setErr((e as Error).message) }
    finally { await refresh(); setBusy(false) }
  }
  const remove = async (id: string) => {
    setBusy(true); setErr(null); setFlash(null)
    try { await store.news.removeBirthday(id); if (editing === id) reset(); setConfirm(null); setFlash('Birthday record removed.') }
    catch (e) { setErr((e as Error).message) }
    finally { await refresh(); setBusy(false) }
  }
  return (
    <div className="news-management">
      <section className="stack">
        <SectionHeading>{editing ? 'Edit birthday' : 'Add birthday'}</SectionHeading>
        <p className="small muted">This roster is visible only to administrators and news managers. No birth year is stored. February 29 greetings appear only in leap years.</p>
        <form className="card news-form" onSubmit={save}>
          <fieldset disabled={busy || loading}>
            <label className="field"><span className="field-label">Student display name</span><input ref={nameInput} value={form.display_name} required maxLength={80} autoComplete="off" onChange={e => setForm({ ...form, display_name: e.target.value })} /></label>
            <div className="news-fields">
              <label className="field"><span className="field-label">Birth month</span><select value={form.birth_month} onChange={e => setForm({ ...form, birth_month: Number(e.target.value) })}>{MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
              <label className="field"><span className="field-label">Birth day</span><input type="number" min={1} max={31} required value={form.birth_day} onChange={e => setForm({ ...form, birth_day: Number(e.target.value) })} /></label>
            </div>
            <label className="news-check"><input type="checkbox" checked={form.consent_given} onChange={e => setForm({ ...form, consent_given: e.target.checked, visible: e.target.checked ? form.visible : false })} /><span>The student has permitted a birthday greeting visible to anyone with the site link</span></label>
            <label className="news-check"><input type="checkbox" checked={form.visible} disabled={!form.consent_given} onChange={e => setForm({ ...form, visible: e.target.checked })} /><span>Show the greeting on their birthday</span></label>
            <p className="small muted">Uncheck permission or visibility to withdraw the greeting. Automatic greetings disappear the next calendar day and are never added to news history.</p>
            <div className="form-actions"><button className="btn-primary">{busy ? 'Saving…' : 'Save birthday'}</button>{editing && <button type="button" className="btn-secondary" onClick={reset}>Cancel edit</button>}</div>
          </fieldset>
          {err && <div className="alert error" role="alert">{err}</div>}
          {flash && <p className="small" role="status">{flash}</p>}
        </form>
      </section>
      <section className="stack"><SectionHeading count={records.length}>Private birthday roster</SectionHeading>
        {loading ? <div className="empty">Loading birthday settings…</div> : records.length === 0 ? <div className="empty">No birthdays recorded. Add only information the student has agreed to share.</div> : <div className="row-list">
          {records.map(b => <div key={b.id} className="news-admin-row"><div className="row-item">
            <span className="row-item-text"><span className="row-item-title">{b.display_name}</span><span className="row-item-meta">{b.birth_day} {MONTHS[b.birth_month - 1]} · {!b.consent_given ? 'No permission' : b.visible ? 'Greeting enabled' : 'Greeting hidden'}</span></span>
            <button className="icon-btn quiet" disabled={busy} aria-label={`Edit birthday: ${b.display_name}`} onClick={() => { setEditing(b.id); setForm({ display_name: b.display_name, birth_month: b.birth_month, birth_day: b.birth_day, consent_given: b.consent_given, visible: b.visible }); setErr(null); setFlash(null); nameInput.current?.focus() }}><Icon name="edit" /></button>
            <button className="icon-btn quiet danger" disabled={busy} aria-label={`Remove birthday: ${b.display_name}`} onClick={() => setConfirm(b.id)}><Icon name="trash" /></button>
          </div>{confirm === b.id && <div className="news-delete-confirm"><p className="small">Remove this birthday record permanently?</p><button className="btn-secondary danger" disabled={busy} onClick={() => remove(b.id)}>Remove record</button><button className="btn-quiet" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>}</div>)}
        </div>}
      </section>
    </div>
  )
}
