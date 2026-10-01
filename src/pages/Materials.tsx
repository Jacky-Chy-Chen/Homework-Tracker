import { useMemo, useRef, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { pad2, SectionLabel, TopBar } from '../components/ui'
import { fmtTag } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import { store, type Material } from '../lib/store'

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const kindOf = (m: Material) => {
  const ext = m.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'
  return ext.length > 4 ? 'FILE' : ext
}
/** WeChat's browser opens these in place; other types usually need "open in browser". */
const opensInline = (m: Material) => /pdf|image\//.test(m.file_type) || /\.(pdf|png|jpe?g|gif|webp)$/i.test(m.file_name)

export default function Materials({ data }: { data: AppData }) {
  const [open, setOpen] = useState(false)
  const bySubject = useMemo(() => {
    const groups = new Map<string, Material[]>()
    for (const m of data.materials) groups.set(m.subject, [...(groups.get(m.subject) ?? []), m])
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.materials])

  const remove = async (m: Material) => {
    if (!confirm(`Delete "${m.title}"?`)) return
    await store.removeMaterial(m)
    await data.reloadMaterials()
  }

  return (
    <>
      <TopBar label="MATERIALS" poster={!!data.user} />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow mono">REVIEW SHEETS · NOTES · SLIDES</div>
          <h1>Materials</h1>
        </div>
        {data.user && (
          <div className="head-actions">
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Icon name="upload" size={16} stroke={2.2} />
              Upload
            </button>
          </div>
        )}
      </header>

      {data.materials.length === 0 ? (
        <div className="empty mono materials-empty">
          Nothing here yet.{data.user ? ' Upload a review sheet, notes or slides.' : ' Your teacher hasn’t added anything.'}
        </div>
      ) : (
        <div className="materials-layout">
          {bySubject.map(([subject, list]) => (
            <section key={subject} className="stack">
              <SectionLabel right={pad2(list.length)}>
                <span style={{ color: subjectColor(subject) }}>{subject.toUpperCase()}</span>
              </SectionLabel>
              <div className="row-list">
                {list.map((m) => (
                  <div key={m.id} className="row-item material-row">
                    <span className="file-kind mono">{kindOf(m)}</span>
                    <div className="row-item-text">
                      <span className="row-item-title">{m.title}</span>
                      <span className="mono muted xsmall">
                        {fmtSize(m.file_size)} · {fmtTag(m.created_at.slice(0, 10))}
                        {m.item_id && data.items.some((i) => i.id === m.item_id) && ` · FOR ${data.items.find((i) => i.id === m.item_id)!.title.toUpperCase()}`}
                      </span>
                      {m.notes && <span className="card-notes small">{m.notes}</span>}
                    </div>
                    <a
                      className="icon-btn ghost"
                      href={store.fileUrl(m)}
                      target="_blank"
                      rel="noreferrer"
                      download={opensInline(m) ? undefined : m.file_name}
                      aria-label={`Open ${m.title}`}
                    >
                      <Icon name={opensInline(m) ? 'arrow' : 'download'} size={18} stroke={1.9} />
                    </a>
                    {data.user && (
                      <button className="icon-btn ghost danger" onClick={() => remove(m)} aria-label={`Delete ${m.title}`}>
                        <Icon name="trash" size={17} stroke={1.8} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mono dim small hint-line">
        In WeChat, PDFs and photos open straight away. Word and Excel files may need “open in browser”.
      </p>

      {open && <UploadSheet data={data} onClose={() => setOpen(false)} />}
    </>
  )
}

function UploadSheet({ data, onClose }: { data: AppData; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [itemId, setItemId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const subjects = useMemo(
    () => [...new Set([...(data.timetable.flat().filter(Boolean) as string[]), ...data.items.map((i) => i.subject)])].sort(),
    [data.timetable, data.items],
  )
  const linkable = data.items.filter((i) => i.type === 'test' || i.type === 'project')

  const pick = (f: File | null) => {
    setFile(f)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setErr('Choose a file first.')
    if (!subject) return setErr('Pick a subject.')
    setBusy(true)
    setErr(null)
    try {
      await store.addMaterial({ title: title.trim() || file.name, subject, notes: notes.trim() || null, item_id: itemId || null }, file)
      await data.reloadMaterials()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head">
          <strong className="sheet-title">Upload material</strong>
          <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={20} stroke={2} /></button>
        </div>

        <div className="field">
          <span className="field-label mono">FILE</span>
          <input
            ref={fileRef}
            type="file"
            className="file-input"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip"
          />
          <button type="button" className="file-drop" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={20} stroke={1.9} />
            <span>{file ? `${file.name} · ${fmtSize(file.size)}` : 'Choose a file (PDF, photo, Word, slides…)'}</span>
          </button>
        </div>

        <label className="field">
          <span className="field-label mono">TITLE</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Unit 2 review sheet" required />
        </label>

        <div className="field">
          <span className="field-label mono">SUBJECT</span>
          <div className="chips">
            {subjects.map((s) => (
              <button type="button" key={s} className={`chip mono ${subject === s ? 'on' : ''}`} aria-pressed={subject === s} onClick={() => setSubject(s)}>
                <span className="swatch" style={{ background: subjectColor(s) }} />{s}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label mono">NOTES <span className="dim">· OPTIONAL</span></span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What it covers, how to use it…" />
        </label>

        {linkable.length > 0 && (
          <label className="field">
            <span className="field-label mono">FOR A TEST OR PROJECT <span className="dim">· OPTIONAL</span></span>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Not linked</option>
              {linkable.map((i) => (
                <option key={i.id} value={i.id}>{i.subject}: {i.title}</option>
              ))}
            </select>
          </label>
        )}

        {err && <div className="alert error">{err}</div>}
        {store.mode === 'demo' && <div className="mono dim xsmall">Demo mode keeps files in this browser only, under 1 MB each.</div>}

        <div className="form-actions">
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
            {!busy && <Icon name="check" size={18} stroke={2.2} />}
          </button>
        </div>
      </form>
    </div>
  )
}
