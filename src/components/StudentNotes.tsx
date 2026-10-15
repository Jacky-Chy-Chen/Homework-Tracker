import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppData } from '../App'
import { store } from '../lib/store'
import { NotesSetupError } from '../lib/student-notes-store'
import { NOTE_ACCEPT, REPORT_CATEGORIES, canEditNote, canRemoveNote, type NoteInput, type NoteReport, type ReportCategory, type StudentNote } from '../lib/student-notes'
import { subjectColor } from '../lib/homework'
import Icon from './Icon'
import { SectionHeading } from './ui'

const dateLabel = (date: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(date))
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function StudentNotes({ data }: { data: AppData }) {
  const [notes, setNotes] = useState<StudentNote[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'setup' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [form, setForm] = useState<StudentNote | 'new' | null>(null)
  const [subject, setSubject] = useState('')
  const [limit, setLimit] = useState(20)
  const [moderate, setModerate] = useState(false)
  const request = useRef(0)
  const reload = useCallback(async () => {
    const epoch = ++request.current
    try {
      const rows = await store.studentNotes.list()
      if (epoch !== request.current) return
      setNotes(rows); setStatus('ready'); setError(null)
    } catch (e) {
      if (epoch !== request.current) return
      setNotes([]); setStatus(e instanceof NotesSetupError ? 'setup' : 'error'); setError((e as Error).message)
    }
  }, [])
  useEffect(() => { reload(); return () => { request.current++ } }, [reload])
  const subjects = useMemo(() => [...new Set([...data.timetable.flat().filter(Boolean) as string[], ...data.items.map(i => i.subject), ...notes.map(n => n.subject)])].sort(), [notes, data.timetable, data.items])
  const filtered = notes.filter(n => !subject || n.subject === subject)
  const groups = new Map<string, StudentNote[]>()
  for (const n of filtered.slice(0,limit)) groups.set(n.subject, [...groups.get(n.subject) ?? [], n])
  const changed = async (message: string) => { setFlash(message); await reload() }
  return <section className="notes-section" aria-label="Student Notes">
    <div className="news-toolbar">
      <div><h2>Student Notes</h2><p className="small muted">Student-contributed · Not officially verified</p></div>
      <div className="notes-actions">
        {data.admin && <button className="btn-secondary" onClick={() => setModerate(v => !v)} aria-expanded={moderate}>{moderate ? 'Close report queue' : 'Review reports'}</button>}
        {data.user && <button className="btn-primary" disabled={status !== 'ready'} onClick={() => { setForm('new'); setFlash(null) }}><Icon name="upload" size={16} />Upload notes</button>}
      </div>
    </div>
    <p className="small muted">Notes publish immediately for signed-in Classboard users. Share only work you have permission to share; your display name will appear as contributor. Reports go privately to administrators.</p>
    {!data.user && <p className="small"><a href="#/post">Sign in</a> to upload notes or report an error.</p>}
    {flash && <p className="alert" role="status">{flash}</p>}
    {status === 'loading' && <p className="empty" role="status">Loading student notes…</p>}
    {error && <div className="alert error" role="alert">{error}{status === 'error' && <button className="btn-quiet" onClick={reload}>Retry loading notes</button>}</div>}
    {form && data.user && <NoteForm key={form === 'new' ? 'new' : form.id} existing={form === 'new' ? undefined : form} subjects={subjects} onClose={() => setForm(null)} onSaved={async warning => { setForm(null); await changed(warning ?? 'Notes saved and visible immediately.') }} />}
    {moderate && data.admin && <ReportQueue notes={notes} onChanged={changed} />}
    {status === 'ready' && <>
      <label className="field news-category-filter"><span className="field-label">Filter student notes by subject</span><select value={subject} onChange={e => { setSubject(e.target.value); setLimit(20) }}><option value="">All subjects</option>{[...new Set(notes.map(n => n.subject))].sort().map(s => <option key={s}>{s}</option>)}</select></label>
      {filtered.length === 0 ? <div className="empty">{notes.length ? 'No notes for this subject.' : 'No student notes yet. Share a useful summary or revision sheet.'}</div> : <div className="materials-layout">
        {[...groups].sort(([a],[b]) => a.localeCompare(b)).map(([s, rows]) => <section className="stack" key={s}>
          <SectionHeading count={filtered.filter(n => n.subject === s).length}><span className="subject-label"><span className="swatch" style={{ background: subjectColor(s) }} />{s}</span></SectionHeading>
          <div className="row-list">{rows.map(note => <NoteRow key={note.id} note={note} data={data} onEdit={() => { setForm(note); setFlash(null) }} onChanged={changed} />)}</div>
        </section>)}
      </div>}
      {filtered.length > limit && <button className="btn-secondary notes-more" onClick={() => setLimit(v => v + 20)}>Show more notes ({filtered.length - limit} remaining)</button>}
    </>}
    <p className="small muted notes-footer">PDF, images, Word and PowerPoint · {store.mode === 'demo' ? '1 MB per file in this browser-only demo; 20 MB with shared storage.' : '20 MB per file. Total capacity depends on the school’s storage plan.'} Files download rather than preview inside this page. Word and slides may need “Open in browser” in WeChat. Use trusted software to open files; format checks are not virus scanning.</p>
  </section>
}

function NoteForm({ existing, subjects, onClose, onSaved }: { existing?: StudentNote; subjects: string[]; onClose: () => void; onSaved: (warning: string | null) => Promise<void> }) {
  const [input, setInput] = useState<NoteInput>({ title: existing?.title ?? '', subject: existing?.subject ?? '', description: existing?.description ?? '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = useRef<HTMLInputElement>(null)
  useEffect(() => { title.current?.focus() }, [])
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { const warning = await store.studentNotes.save(input, existing, file); await onSaved(warning) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <form className="card news-form notes-form" onSubmit={save} aria-label={existing ? 'Edit your notes' : 'Upload student notes'}>
    <h3>{existing ? 'Edit your notes' : 'Upload student notes'}</h3>
    <fieldset disabled={busy}>
      <div className="news-fields">
        <label className="field"><span className="field-label">Title</span><input ref={title} required maxLength={160} value={input.title} onChange={e => setInput({ ...input, title: e.target.value })} /></label>
        <label className="field"><span className="field-label">Subject</span><input required maxLength={80} list="note-subject-options" value={input.subject} onChange={e => setInput({ ...input, subject: e.target.value })} /><datalist id="note-subject-options">{subjects.map(s => <option key={s} value={s} />)}</datalist></label>
      </div>
      <label className="field"><span className="field-label">Description (optional)</span><textarea rows={3} maxLength={2000} value={input.description ?? ''} onChange={e => setInput({ ...input, description: e.target.value })} /></label>
      <label className="field"><span className="field-label">{existing ? 'Replace file (optional)' : 'File'}</span><input type="file" required={!existing} accept={NOTE_ACCEPT} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !input.title) setInput({ ...input, title: f.name.replace(/\.[^.]+$/, '') }) }} /><span className="small muted">PDF, JPEG, PNG, GIF, WebP, DOC, DOCX, PPT or PPTX. {store.mode === 'demo' ? 'Up to 1 MB in demo mode.' : 'Up to 20 MB.'}{existing && ` Current file: ${existing.file_name}`}</span></label>
      <p className="small muted">Your contributor name and original upload date stay unchanged when editing. Do not upload classmates’ personal information or private school documents.</p>
      <div className="form-actions"><button className="btn-primary">{busy ? 'Saving…' : existing ? 'Save changes' : 'Publish notes'}</button><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button></div>
    </fieldset>
    {error && <div className="alert error" role="alert">{error}</div>}
  </form>
}

function NoteRow({ note, data, onEdit, onChanged }: { note: StudentNote; data: AppData; onEdit: () => void; onChanged: (message: string) => Promise<void> }) {
  const [reporting, setReporting] = useState(false), [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { setUrl(null) }, [note.file_path])
  useEffect(() => { if (!url) return; const timer = window.setTimeout(() => setUrl(null), 50000); return () => window.clearTimeout(timer) }, [url])
  const remove = async () => { setBusy(true); setError(null); try { const warning = await store.studentNotes.remove(note); await onChanged(warning ?? 'Note removed.'); setConfirm(false) } catch(e) { setError((e as Error).message); await onChanged('Reloaded notes. Check the error before retrying.') } finally { setBusy(false) } }
  const download = async () => { setBusy(true); setError(null); try { setUrl(await store.studentNotes.fileUrl(note)) } catch(e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <article className="student-note">
    <div className="row-item material-row">
      <span className="file-kind">{note.file_name.split('.').pop()?.toUpperCase()}</span>
      <div className="row-item-text"><h3 className="row-item-title">{note.title}</h3><span className="row-item-meta">{note.contributor} · {dateLabel(note.created_at)} · {sizeLabel(note.file_size)}</span>{note.description && <p className="card-notes">{note.description}</p>}{note.under_review && <span className="note-review">Under Review</span>}</div>
    </div>
    <div className="note-controls">
      {url ? <a className="btn-secondary" href={url} download={note.file_name} target="_blank" rel="noreferrer">Open/download file</a> : <button className="btn-secondary" disabled={busy} onClick={download} aria-label={`Prepare download: ${note.title}`}>{busy ? 'Working…' : 'Download file'}</button>}
      <button className="btn-quiet" disabled={busy || !data.user} onClick={() => setReporting(v => !v)} aria-expanded={reporting}>Report an Error</button>
      {canEditNote(data.user, note) && <button className="btn-quiet" disabled={busy} onClick={onEdit}>Edit</button>}
      {canRemoveNote(data.user, note) && <button className="btn-quiet danger" disabled={busy} onClick={() => setConfirm(true)}>Remove</button>}
    </div>
    {confirm && <div className="news-delete-confirm"><p className="small">Remove “{note.title}” and its file?</p><button className="btn-secondary danger" disabled={busy} onClick={remove}>Confirm removal</button><button className="btn-quiet" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div>}
    {reporting && data.user && <ReportForm note={note} onCancel={() => setReporting(false)} onSent={async () => { setReporting(false); await onChanged('Report sent privately to administrators. The note stays available while under review.') }} />}
    {error && <p className="alert error" role="alert">{error}</p>}
  </article>
}

function ReportForm({ note, onCancel, onSent }: { note: StudentNote; onCancel: () => void; onSent: () => Promise<void> }) {
  const [category, setCategory] = useState<ReportCategory>('incorrect'), [explanation, setExplanation] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError(null); try { await store.studentNotes.report(note.id, category, explanation); await onSent() } catch(e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <form className="news-form note-report-form" onSubmit={submit} aria-label={`Report an error: ${note.title}`}>
    <fieldset disabled={busy}>
      <label className="field"><span className="field-label">Report category</span><select value={category} onChange={e => setCategory(e.target.value as ReportCategory)}>{Object.entries(REPORT_CATEGORIES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="field"><span className="field-label">Explanation (optional)</span><textarea rows={3} maxLength={2000} value={explanation} onChange={e => setExplanation(e.target.value)} /></label>
      <p className="small muted">Private to administrators. One report per account per note, including dismissed reports. Reports never automatically remove a file.</p>
      <div className="form-actions"><button className="btn-primary">{busy ? 'Sending…' : 'Send report'}</button><button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
    {error && <p className="alert error" role="alert">{error}</p>}
  </form>
}

function ReportQueue({ notes, onChanged }: { notes: StudentNote[]; onChanged: (message: string) => Promise<void> }) {
  const [reports, setReports] = useState<NoteReport[]>([]), [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const epoch = useRef(0)
  const reload = useCallback(async () => { const id = ++epoch.current; setLoading(true); try { const rows = await store.studentNotes.reports(); if (id === epoch.current) { setReports(rows); setError(null) } } catch(e) { if (id === epoch.current) { setReports([]); setError((e as Error).message) } } finally { if (id === epoch.current) setLoading(false) } }, [])
  useEffect(() => { reload(); return () => { epoch.current++ } }, [reload, notes])
  const act = async (operation: () => Promise<unknown>, message: string) => { setBusy(true); setError(null); try { const warning = await operation(); setConfirm(null); await onChanged(typeof warning === 'string' ? warning : message); await reload() } catch(e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <section className="notes-moderation stack" aria-label="Private report queue">
    <SectionHeading count={reports.length}>Private report queue</SectionHeading>
    <p className="small muted">Administrator-only. Dismissing the last unresolved report clears its badge. Removing a note also removes its reports.</p>
    {loading ? <p className="empty" role="status">Loading reports…</p> : reports.length === 0 && !error ? <p className="empty">No unresolved reports.</p> : <div className="row-list">{reports.map(r => {
      const note = notes.find(n => n.id === r.note_id)
      return <article className="news-entry notes-report-entry" key={r.id}>
        <h3>{note?.title ?? 'Note unavailable — reload notes'}</h3><p className="small">{REPORT_CATEGORIES[r.category]} · {dateLabel(r.created_at)}</p>{r.explanation && <p className="news-body">{r.explanation}</p>}
        <div className="note-controls"><button className="btn-secondary" disabled={busy} onClick={() => act(() => store.studentNotes.dismiss(r.id), 'Report dismissed.')}>Dismiss report</button>{note && <button className="btn-quiet danger" disabled={busy} onClick={() => setConfirm(r.id)}>Remove note</button>}</div>
        {confirm === r.id && note && <div className="news-delete-confirm"><p className="small">Remove this note, its file and all associated reports?</p><button className="btn-secondary danger" disabled={busy} onClick={() => act(() => store.studentNotes.remove(note), 'Note removed.')}>Confirm removal</button><button className="btn-quiet" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>}
      </article>
    })}</div>}
    {error && <div className="alert error" role="alert">{error}<button className="btn-quiet" onClick={reload} disabled={busy}>Retry loading reports</button></div>}
  </section>
}
