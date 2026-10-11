import { useEffect, useState } from 'react'
import type { AppData } from '../App'
import { canManageNews, currentGreetings, NEWS_CATEGORIES, recentNews, type NewsItem } from '../lib/news'
import { store } from '../lib/store'
import { parseISO } from '../lib/dates'
import { SectionHeading } from './ui'

export const newsDate = (date: string) => parseISO(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function NewsImage({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const signed = await store.news.imageUrl(path)
        if (active) { setUrl(signed); setFailed(false) }
      } catch { if (active) { setUrl(null); setFailed(true) } }
    }
    setUrl(null)
    load()
    const interval = window.setInterval(load, 8 * 60 * 1000)
    return () => { active = false; window.clearInterval(interval) }
  }, [path])
  return failed ? <p className="small muted">Image unavailable. The news text is still shown below.</p>
    : url ? <img className="news-image" src={url} alt={`Image for ${title}`} loading="lazy" onError={() => setFailed(true)} /> : null
}

export function NewsCard({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  return (
    <article className={`news-entry ${compact ? 'news-compact' : ''}`}>
      <div className="news-meta">
        {item.pinned && <span className="news-pinned">Pinned</span>}
        <span>{NEWS_CATEGORIES[item.category]}</span>
        <time dateTime={item.published_on}>{newsDate(item.published_on)}</time>
      </div>
      <h3>{compact ? <a href={`#/news?id=${encodeURIComponent(item.id)}`}>{item.title}</a> : item.title}</h3>
      {item.image_path && <NewsImage path={item.image_path} title={item.title} />}
      <p className={compact ? 'news-preview' : 'news-body'}>{compact ? item.body.slice(0, 220) + (item.body.length > 220 ? '…' : '') : item.body}</p>
    </article>
  )
}

export function NewsStatus({ data }: { data: AppData }) {
  if (data.newsStatus === 'ready') return null
  if (data.newsStatus === 'loading') return <div className="empty" role="status">Loading class news…</div>
  if (data.newsStatus === 'setup') return <div className="empty">Class News is not set up yet.{canManageNews(data.user) && <p className="small muted">The Phase 4 database migration is ready for administrator review. Existing homework is unaffected.</p>}</div>
  return <div className="alert error" role="alert">Could not load Class News. <button className="link-btn" onClick={data.reloadNews}>Try again</button></div>
}

/** Lower priority than homework, with at most three posts and today's greetings. */
export default function ClassNews({ data }: { data: AppData }) {
  const posts = recentNews(data.news, data.newsDay)
  const greetings = currentGreetings(data.greetings, data.newsDay)
  return (
    <section className="stack class-news" aria-labelledby="class-news-heading">
      <SectionHeading action={<a className="link-btn" href="#/news">View All</a>}><span id="class-news-heading">Class News</span></SectionHeading>
      <NewsStatus data={data} />
      {data.newsStatus === 'ready' && (
        <>
          {greetings.map(g => <article key={g.greeting_key} className="birthday-greeting">
            <h3>Happy birthday, {g.display_name}!</h3>
            <p className="small muted">Birthdays · <time dateTime={g.greeting_date}>{newsDate(g.greeting_date)}</time> · Wishing you a wonderful day.</p>
          </article>)}
          {posts.length > 0 ? <div className="news-feed">{posts.map(n => <NewsCard key={n.id} item={n} compact />)}</div>
            : greetings.length === 0 && <div className="empty">No recent class updates.</div>}
          {canManageNews(data.user) && <a className="link-btn news-manage-link" href="#/news?view=manage">Manage news and birthdays</a>}
        </>
      )}
    </section>
  )
}
