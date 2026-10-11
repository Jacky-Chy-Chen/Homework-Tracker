import { useRef, useState } from 'react'
import type { AppData } from '../App'
import { canManageNews, NEWS_CATEGORIES, validateNews, type NewNews, type NewsCategory, type NewsItem } from '../lib/news'
import { store } from '../lib/store'
import { NewsCleanupError } from '../lib/news-store'
import Icon from './Icon'
import { SectionHeading } from './ui'
import { newsDate } from './ClassNews'

export default function NewsManager({ data }: { data: AppData }) {
  const blank = (): NewNews => ({ title: '', body: '', category: 'announcement', published_on: data.newsDay, pinned: false })
  const [form, setForm] = useState<NewNews>(blank)
  const [editing, setEditing] = useState<NewsItem | undefined>()
  const [image, setImage] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [fileKey, setFileKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  if (!canManageNews(data.user)) return null
  const reset = () => { setForm(blank()); setEditing(undefined); setImage(null); setRemoveImage(false); setFileKey(k => k + 1) }
  const edit = (item: NewsItem) => {
    setEditing(item)
    setForm({ title: item.title, body: item.body, category: item.category, published_on: item.published_on, pinned: item.pinned })
    setImage(null); setRemoveImage(false); setFileKey(k => k + 1); setErr(null); setFlash(null)
    titleInput.current?.focus()
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setErr(null); setFlash(null)
    try {
      validateNews(form)
      await store.news.save(form, editing, image, removeImage)
      reset(); setFlash('News saved. Future-dated posts stay hidden until their publication date.')
    } catch (e) { if (e instanceof NewsCleanupError) reset(); setErr((e as Error).message) }
    finally { await data.reloadNews(); setBusy(false) }
  }
  const remove = async (item: NewsItem) => {
    setBusy(true); setErr(null); setFlash(null)
    try {
      await store.news.remove(item)
      if (editing?.id === item.id) reset()
      setConfirm(null); setFlash('News removed.')
    } catch (e) { if (e instanceof NewsCleanupError) { if (editing?.id === item.id) reset(); setConfirm(null) }; setErr((e as Error).message) }
    finally { await data.reloadNews(); setBusy(false) }
  }
  const posts = [...data.news].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.published_on.localeCompare(a.published_on) || a.id.localeCompare(b.id))
  return (
    <div className="news-management">
      <section className="stack">
        <SectionHeading>{editing ? 'Edit news' : 'Add news'}</SectionHeading>
        <form className="card news-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <label className="field"><span className="field-label">Title</span><input ref={titleInput} value={form.title} maxLength={160} required onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <div className="news-fields">
              <label className="field"><span className="field-label">Category</span><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as NewsCategory })}>
                {Object.entries(NEWS_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
              <label className="field"><span className="field-label">Publication date</span><input type="date" required value={form.published_on} onChange={e => setForm({ ...form, published_on: e.target.value })} /></label>
            </div>
            <label className="field"><span className="field-label">News text</span><textarea value={form.body} rows={6} maxLength={10000} required onChange={e => setForm({ ...form, body: e.target.value })} /></label>
            <label className="news-check"><input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} /><span>Pin this announcement</span></label>
            <label className="field"><span className="field-label">Image (optional)</span><input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImage(e.target.files?.[0] ?? null)} /><span className="small muted">JPEG, PNG or WebP. Up to {store.mode === 'demo' ? '1 MB in demo mode' : '5 MB'}. Share only images you have permission to publish.</span></label>
            {editing?.image_path && <label className="news-check"><input type="checkbox" checked={removeImage} onChange={e => setRemoveImage(e.target.checked)} /><span>Remove the current image</span></label>}
            <p className="small muted">For birthday-related posts or photos, get permission before publishing. Automatic birthday greetings are managed separately and never enter this archive.</p>
            <div className="form-actions"><button className="btn-primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish news'}</button>{editing && <button className="btn-secondary" type="button" onClick={reset}>Cancel edit</button>}</div>
          </fieldset>
          {err && <div className="alert error" role="alert">{err}</div>}
          {flash && <p className="small" role="status">{flash}</p>}
        </form>
      </section>
      <section className="stack">
        <SectionHeading count={posts.length}>Published & scheduled</SectionHeading>
        {posts.length === 0 ? <div className="empty">No news posts yet.</div> : <div className="row-list">
          {posts.map(item => <div key={item.id} className="news-admin-row">
            <div className="row-item">
              <span className="row-item-text"><span className="row-item-title">{item.title}</span><span className="row-item-meta">{newsDate(item.published_on)} · {item.published_on > data.newsDay ? 'Scheduled' : 'Published'}{item.pinned ? ' · Pinned' : ''}</span></span>
              <button className="icon-btn quiet" disabled={busy} aria-label={`Edit news: ${item.title}`} onClick={() => edit(item)}><Icon name="edit" /></button>
              <button className="icon-btn quiet danger" disabled={busy} aria-label={`Remove news: ${item.title}`} onClick={() => setConfirm(item.id)}><Icon name="trash" /></button>
            </div>
            {confirm === item.id && <div className="news-delete-confirm"><p className="small">Remove this post permanently?</p><button className="btn-secondary danger" disabled={busy} onClick={() => remove(item)}>Remove post</button><button className="btn-quiet" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>}
          </div>)}
        </div>}
      </section>
    </div>
  )
}
