import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import ItemCard from '../components/ItemCard'
import { fmtLong, toISO, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import type { Item } from '../lib/store'

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3

export default function Calendar({ data }: { data: AppData }) {
  const today = todayISO()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState(today)
  const [hideDaily, setHideDaily] = useState(false)

  const byDue = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of data.items) {
      if (hideDaily && i.type === 'daily') continue
      m.set(i.due_date, [...(m.get(i.due_date) ?? []), i])
    }
    return m
  }, [data.items, hideDaily])

  // Weeks start on Monday; pad with days from neighbouring months.
  const cells = useMemo(() => {
    const start = new Date(month)
    start.setDate(1 - ((month.getDay() + 6) % 7))
    const out: { iso: string; inMonth: boolean }[] = []
    for (let d = new Date(start); out.length < 42; d.setDate(d.getDate() + 1)) {
      out.push({ iso: toISO(d), inMonth: d.getMonth() === month.getMonth() })
    }
    // Drop a trailing week that is entirely next month.
    return out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out
  }, [month])

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const goToday = () => {
    const d = new Date()
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelected(today)
  }
  const dayItems = byDue.get(selected) ?? []

  return (
    <>
      <header className="day-nav">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <div className="day-label">
          <h1>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h1>
          <div className="sub">
            <button className="text-btn" onClick={goToday}>Today</button>
            <label className="toggle">
              <input type="checkbox" checked={hideDaily} onChange={(e) => setHideDaily(e.target.checked)} />
              Projects & tests only
            </label>
          </div>
        </div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </header>

      <div className="cal">
        {WEEK.map((w) => (
          <div key={w} className="cal-head">{w}</div>
        ))}
        {cells.map(({ iso, inMonth }) => {
          const list = byDue.get(iso) ?? []
          const cls = ['cal-cell', inMonth ? '' : 'out', iso === today ? 'today' : '', iso === selected ? 'selected' : '']
          return (
            <button key={iso} className={cls.join(' ')} onClick={() => setSelected(iso)}>
              <span className="cal-num">{Number(iso.slice(8))}</span>
              {list.slice(0, MAX_CHIPS).map((i) => (
                <span
                  key={i.id}
                  className={`chip chip-${i.type}`}
                  style={{ '--c': subjectColor(i.subject) } as React.CSSProperties}
                  title={`${i.subject}: ${i.title}`}
                >
                  {i.type !== 'daily' && i.type !== 'other' && <span className="chip-icon">{i.type === 'test' ? '🧪 ' : '📂 '}</span>}
                  {i.subject}
                </span>
              ))}
              {list.length > MAX_CHIPS && <span className="more">+{list.length - MAX_CHIPS}</span>}
            </button>
          )
        })}
      </div>

      <section className="day-detail">
        <h2>Due {fmtLong(selected)}</h2>
        {dayItems.length === 0 ? (
          <div className="empty">Nothing due.</div>
        ) : (
          dayItems.map((i) => <ItemCard key={i.id} item={i} />)
        )}
      </section>
    </>
  )
}
