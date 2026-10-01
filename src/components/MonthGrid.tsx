import { useMemo } from 'react'
import { toISO, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import Icon from './Icon'
import type { Item } from '../lib/store'

const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MAX_BARS = 3

interface Props {
  month: Date
  items: Item[]
  selected?: string
  onSelect?: (iso: string) => void
}

/** Monday-first month grid: a colored bar per item due, a dot for tests/projects. */
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
      {WEEK.map((w) => (
        <div key={w} className="month-head mono">{w}</div>
      ))}
      {cells.map(({ iso, day, inMonth }) => {
        const list = byDue.get(iso) ?? []
        const flag = list.some((i) => i.type === 'test') ? 'test' : list.some((i) => i.type === 'project') ? 'project' : null
        const cls = ['month-cell', inMonth ? '' : 'out', iso === selected ? 'selected' : '', onSelect ? '' : 'static']
        const body = (
          <>
            <span className="month-cell-top">
              <span className={`month-num mono ${iso === today ? 'today' : ''}`}>{day}</span>
              {flag === 'test' ? (
                <span className="flag-star" title="Test"><Icon name="star" size={13} stroke={1.5} /></span>
              ) : flag ? (
                <span className="flag flag-project" />
              ) : null}
            </span>
            <span className="bars">
              {list.slice(0, MAX_BARS).map((i) => (
                <span key={i.id} className="bar" style={{ background: subjectColor(i.subject) }} />
              ))}
            </span>
          </>
        )
        const label = `${iso}: ${list.length} item${list.length === 1 ? '' : 's'} due`
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
    <div className="legend mono">
      <span><span className="flag-star"><Icon name="star" size={13} stroke={1.5} /></span>TEST</span>
      <span><span className="flag flag-project" />PROJECT</span>
      <span><span className="bar legend-bar" />ITEM, BY SUBJECT</span>
    </div>
  )
}
