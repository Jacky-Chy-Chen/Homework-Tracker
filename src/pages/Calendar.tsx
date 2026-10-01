import { useMemo, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import MonthGrid, { Legend } from '../components/MonthGrid'
import { ItemCard, pad2, SectionLabel, TopBar } from '../components/ui'
import { onCalendar } from '../lib/homework'
import { fmtTag, parseISO, todayISO } from '../lib/dates'

export default function Calendar({ data }: { data: AppData }) {
  const today = todayISO()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState(today)
  const [bigOnly, setBigOnly] = useState(false)

  // Homework due the next school day never reaches the calendar; it lives on the Today page.
  const shown = useMemo(() => {
    const planned = data.items.filter(onCalendar)
    return bigOnly ? planned.filter((i) => i.type === 'test' || i.type === 'project') : planned
  }, [data.items, bigOnly])
  const dayItems = shown.filter((i) => i.due_date === selected)

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const select = (iso: string) => {
    setSelected(iso)
    const d = parseISO(iso)
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const onThisMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()

  return (
    <>
      <TopBar label="CALENDAR" editor={!!data.user} />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow mono">{month.getFullYear()}</div>
          <h1>{month.toLocaleDateString('en-US', { month: 'long' })}</h1>
        </div>
        <div className="head-actions">
          {!onThisMonth && (
            <button className="btn-ghost mono" onClick={() => { select(today) }}>TODAY</button>
          )}
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
            <Icon name="left" />
          </button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">
            <Icon name="right" />
          </button>
        </div>
      </header>

      <div className="cal-layout">
        <div className="stack">
          <div className="seg seg-2" role="radiogroup" aria-label="Show">
            <button role="radio" aria-checked={!bigOnly} className={`mono ${!bigOnly ? 'on' : ''}`} onClick={() => setBigOnly(false)}>ALL</button>
            <button role="radio" aria-checked={bigOnly} className={`mono ${bigOnly ? 'on' : ''}`} onClick={() => setBigOnly(true)}>PROJECTS + TESTS</button>
          </div>
          <MonthGrid month={month} items={shown} selected={selected} onSelect={select} />
          <Legend />
        </div>

        <section className="stack">
          <SectionLabel right={pad2(dayItems.length)}>DUE {fmtTag(selected)}</SectionLabel>
          {dayItems.length === 0 ? (
            <div className="empty mono">Nothing due.</div>
          ) : (
            dayItems.map((i) => <ItemCard key={i.id} item={i} files={data.materials.filter((m) => m.item_id === i.id)} tick />)
          )}
        </section>
      </div>
    </>
  )
}
