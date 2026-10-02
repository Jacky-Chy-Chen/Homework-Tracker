import { useEffect, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import MonthGrid, { Legend } from '../components/MonthGrid'
import { ItemCard, MessageCard, SectionHeading, TopBar, UpcomingCard } from '../components/ui'
import { addDays, fmtEyebrow, fmtLong, fmtTag, nextSchoolDay, parseISO, relative, todayISO } from '../lib/dates'
import { assignedOn, buildMessage, buildWeekMessage, groupBySubject, onCalendar, REMINDER_DAYS, upcomingFrom } from '../lib/homework'
import { changeLines, daySlots } from '../lib/schedule'

/** A link can open a particular date: #/?d=2026-10-08 */
function dayFromHash() {
  const q = location.hash.split('?')[1] ?? ''
  const d = new URLSearchParams(q).get('d')
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

export default function Today({ data }: { data: AppData }) {
  const today = todayISO()
  const [day, setDay] = useState(() => dayFromHash() ?? today)
  const [month, setMonth] = useState(() => {
    const d = parseISO(dayFromHash() ?? today)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const isToday = day === today

  // Following a #/?d=… link while the page is already open should still move the day.
  useEffect(() => {
    const onHash = () => {
      const asked = dayFromHash() ?? today
      setDay(asked)
      const d = parseISO(asked)
      setMonth((m) => (d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth() ? m : new Date(d.getFullYear(), d.getMonth(), 1)))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [today])

  /** Picking a day pulls the grid to that month; the month arrows then browse freely. */
  const selectDay = (iso: string) => {
    setDay(iso)
    const d = parseISO(iso)
    if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) {
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }
    // Keep the address shareable without filling up the back button.
    location.replace(iso === today ? '#/' : `#/?d=${iso}`)
  }

  // Subjects stay together, in the order the chat message uses.
  const posted = groupBySubject(assignedOn(data.items, day)).flatMap(([, list]) => list)
  const upcoming = upcomingFrom(data.items, today)
  // Everything due on the chosen day, minus homework that was only set the day before.
  const dueThisDay = data.items.filter((i) => i.due_date === day && onCalendar(i))
  // One calendar, everything on it: tests, projects and longer-range homework.
  const onGrid = data.items.filter(onCalendar)

  const filesFor = (id: string) => data.materials.filter((m) => m.item_id === id)
  // Timetable changes for the next school day go into the message, so the class hears about swaps.
  const nextDay = nextSchoolDay(day)
  const swaps = changeLines(daySlots(nextDay, data.timetable, data.changes))
  const nextMonday = addDays(today, ((8 - parseISO(today).getDay()) % 7) || 7)
  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <>
      <TopBar editor={!!data.user} />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow">
            {fmtEyebrow(day)}
            {!isToday && ` · ${relative(today, day)}`}
          </div>
          <h1>{isToday ? 'Today' : fmtLong(day)}</h1>
        </div>
        <div className="head-actions">
          {!isToday && <button className="btn-quiet" onClick={() => selectDay(today)}>Today</button>}
          <button className="icon-btn" onClick={() => selectDay(addDays(day, -1))} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <button className="icon-btn" onClick={() => selectDay(addDays(day, 1))} aria-label="Next day">
            <Icon name="right" />
          </button>
          {data.user && (
            <a href="#/post" className="btn-primary desktop-only">
              <Icon name="plus" size={16} stroke={2.4} />
              Add homework
            </a>
          )}
        </div>
      </header>

      {!data.loading && (
        <div className="status">
          <span><span className="dot dot-accent" />{posted.length} {isToday ? 'new today' : 'posted'}</span>
          <span><span className="dot dot-warn" />{upcoming.length} coming up</span>
        </div>
      )}

      <div className="today-grid">
        <div className="col">
          <section className="stack order-1">
            <SectionHeading count={posted.length}>{isToday ? 'Homework' : 'Posted this day'}</SectionHeading>
            {data.loading ? (
              <div className="empty">Loading…</div>
            ) : posted.length === 0 ? (
              <div className="empty">No homework posted for this day.</div>
            ) : (
              posted.map((i) => <ItemCard key={i.id} item={i} files={filesFor(i.id)} tick />)
            )}
          </section>

          {dueThisDay.length > 0 && (
            <section className="stack order-2">
              <SectionHeading count={dueThisDay.length}>Due this day</SectionHeading>
              {dueThisDay.map((i) => <ItemCard key={i.id} item={i} files={filesFor(i.id)} tick />)}
            </section>
          )}

          {data.user && !data.loading && (
            <div className="order-5">
              <MessageCard
                text={buildMessage(data.items, day, swaps, fmtTag(nextDay))}
                weekText={buildWeekMessage(data.items, nextMonday)}
                reminders={upcoming.length + swaps.length}
              />
            </div>
          )}
        </div>

        <div className="col">
          <section className="stack order-3">
            <SectionHeading
              action={
                <div className="head-actions">
                  <button className="icon-btn sm" onClick={() => shiftMonth(-1)} aria-label="Previous month"><Icon name="left" size={16} /></button>
                  <button className="icon-btn sm" onClick={() => shiftMonth(1)} aria-label="Next month"><Icon name="right" size={16} /></button>
                </div>
              }
            >
              {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </SectionHeading>

            <div className="card month-card">
              <MonthGrid month={month} items={onGrid} selected={day} onSelect={selectDay} />
              <Legend />
            </div>
          </section>

          {upcoming.length > 0 && (
            <section className="stack order-4">
              <SectionHeading count={upcoming.length}>Coming up</SectionHeading>
              {upcoming.map((i) => <UpcomingCard key={i.id} item={i} from={today} files={filesFor(i.id)} />)}
            </section>
          )}
        </div>
      </div>
    </>
  )
}

export { REMINDER_DAYS }
