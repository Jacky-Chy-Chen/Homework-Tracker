import { useMemo } from 'react'
import { fmtLong, toISO, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import Icon from './Icon'
import type { Item } from '../lib/store'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MAX_DOTS = 3

interface Props {
  month: Date
  items: Item[]
  selected?: string
  onSelect?: (iso: string) => void
}

/** Monday-first month grid: a star on test days, otherwise a dot per item due. */
export default function MonthGrid({ month, items, selected, onSelect }: Props) {
  const today = todayISO()

  const byDue = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of items) m.set(i.due_date, [...(m.get(i.due_date) ?? []), i])
    return m
  }, [items])

  const cells = useMemo(() => {
    const start = new Date(month)
    start.setDate(1 - ((month.getDay() + 6) % 7))
    const out: { iso: string; day: number; inMonth: boolean }[] = []
    for (let d = new Date(start); out.length < 42; d.setDate(d.getDate() + 1)) {
      out.push({ iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === month.getMonth() })
    }
    // Drop a trailing week that is entirely next month.
    return out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out
  }, [month])

  return (
    <div className="month-grid">
      {WEEK.map((w, i) => (
        <div key={i} className="month-head">{w}</div>
      ))}
      {cells.map(({ iso, day, inMonth }) => {
        const list = byDue.get(iso) ?? []
        const hasTest = list.some((i) => i.type === 'test')
        const cls = ['month-cell', inMonth ? '' : 'out', iso === selected ? 'selected' : '', onSelect ? '' : 'static']
        const body = (
          <>
            <span className={`month-num ${iso === today ? 'today' : ''}`}>{day}</span>
            <span className="marks">
              {hasTest ? (
                <span className="mark-star"><Icon name="star" size={11} stroke={0} /></span>
              ) : (
                list.slice(0, MAX_DOTS).map((i) => (
                  <span key={i.id} className="mark-dot" style={{ background: subjectColor(i.subject) }} />
                ))
              )}
            </span>
          </>
        )
        const label = `${fmtLong(iso)}: ${list.length} item${list.length === 1 ? '' : 's'} due`
        return onSelect ? (
          <button key={iso} className={cls.join(' ')} onClick={() => onSelect(iso)} aria-label={label} aria-pressed={iso === selected}>
            {body}
          </button>
        ) : (
          <div key={iso} className={cls.join(' ')} aria-label={label}>{body}</div>
        )
      })}
    </div>
  )
}

export function Legend() {
  return (
    <div className="legend">
      <span>
        <span className="mark-star"><Icon name="star" size={11} stroke={0} /></span>
        Test day
      </span>
      <span>
        <span className="mark-dot" style={{ background: 'var(--muted)' }} />
        One item due, by subject
      </span>
    </div>
  )
}
