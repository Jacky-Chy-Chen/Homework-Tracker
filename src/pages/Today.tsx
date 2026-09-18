import { useState } from 'react'
import type { AppData } from '../App'
import ItemCard from '../components/ItemCard'
import { addDays, fmtLong, relative, todayISO } from '../lib/dates'
import { assignedOn, buildMessage, groupBySubject, REMINDER_DAYS, subjectColor, upcomingFrom } from '../lib/homework'

export default function Today({ data }: { data: AppData }) {
  const [day, setDay] = useState(todayISO)
  const today = todayISO()
  const posted = assignedOn(data.items, day)
  const upcoming = upcomingFrom(data.items, day)

  return (
    <>
      <header className="day-nav">
        <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">‹</button>
        <div className="day-label">
          <h1>{day === today ? "Today's homework" : fmtLong(day)}</h1>
          <div className="sub">
            {day === today ? fmtLong(day) : relative(today, day)}
            {day !== today && (
              <button className="text-btn" onClick={() => setDay(today)}>Back to today</button>
            )}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">›</button>
      </header>

      {data.loading ? (
        <p className="muted">Loading…</p>
      ) : posted.length === 0 ? (
        <div className="empty">No homework posted for this day.</div>
      ) : (
        groupBySubject(posted).map(([subject, list]) => (
          <section key={subject} className="subject-group">
            <h2 style={{ color: subjectColor(subject) }}>{subject}</h2>
            {list.map((i) => <ItemCard key={i.id} item={i} hideSubject />)}
          </section>
        ))
      )}

      {upcoming.length > 0 && (
        <section className="upcoming">
          <h2>⏰ Coming up (next {REMINDER_DAYS} days)</h2>
          {upcoming.map((i) => <ItemCard key={i.id} item={i} />)}
        </section>
      )}

      {data.user && !data.loading && <CopyMessage text={buildMessage(data.items, day)} />}
    </>
  )
}

function CopyMessage({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // WeChat's browser often blocks the async clipboard API; fall back to execCommand.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, text.length)
      try {
        ok = document.execCommand('copy')
      } catch {}
      document.body.removeChild(ta)
    }
    setStatus(ok ? 'copied' : 'failed')
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <section className="message-box">
      <div className="message-head">
        <h2>💬 Group chat message</h2>
        <button className="primary" onClick={copy}>
          {status === 'copied' ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {status === 'failed' && <p className="muted">Couldn't copy automatically. Long-press the text below to copy it.</p>}
      <textarea className="message" readOnly value={text} rows={Math.min(16, text.split('\n').length + 1)} />
    </section>
  )
}
