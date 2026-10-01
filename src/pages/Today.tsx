import { useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import MonthGrid from '../components/MonthGrid'
import { ItemCard, MessageCard, SectionHeading, TopBar, UpcomingCard } from '../components/ui'
import { addDays, fmtEyebrow, fmtLong, fmtTag, nextSchoolDay, parseISO, relative, todayISO } from '../lib/dates'
import { assignedOn, buildMessage, buildWeekMessage, groupBySubject, onCalendar, REMINDER_DAYS, upcomingFrom } from '../lib/homework'
import { changeLines, daySlots } from '../lib/schedule'

export default function Today({ data }: { data: AppData }) {
  const [day, setDay] = useState(todayISO)
  const today = todayISO()
  const isToday = day === today
  // Keep subjects together, the same order the chat message uses.
  const posted = groupBySubject(assignedOn(data.items, day)).flatMap(([, list]) => list)
  const upcoming = upcomingFrom(data.items, day)
  const d = parseISO(day)
  const month = new Date(d.getFullYear(), d.getMonth(), 1)
  const filesFor = (id: string) => data.materials.filter((m) => m.item_id === id)
  // Timetable changes for the next school day go into the message, so the class hears about swaps.
  const nextDay = nextSchoolDay(day)
  const swaps = changeLines(daySlots(nextDay, data.timetable, data.changes))
  // Monday of next week, for the Sunday-night preview.
  const nextMonday = addDays(today, ((8 - parseISO(today).getDay()) % 7) || 7)

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
          {!isToday && <button className="btn-quiet" onClick={() => setDay(today)}>Today</button>}
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
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
            <SectionHeading count={posted.length}>Homework</SectionHeading>
            {data.loading ? (
              <div className="empty">Loading…</div>
            ) : posted.length === 0 ? (
              <div className="empty">No homework posted for this day.</div>
            ) : (
              posted.map((i) => <ItemCard key={i.id} item={i} files={filesFor(i.id)} tick />)
            )}
          </section>

          {data.user && !data.loading && (
            <div className="order-3">
              <MessageCard
                text={buildMessage(data.items, day, swaps, fmtTag(nextDay))}
                weekText={buildWeekMessage(data.items, nextMonday)}
                reminders={upcoming.length + swaps.length}
              />
            </div>
          )}
        </div>

        <div className="col">
          {/* Sits level with "Homework" on wide screens; hidden on phones, where the Calendar tab is a tap away. */}
          <section className="stack desktop-only">
            <SectionHeading action={<a href="#/calendar" className="section-link">Open calendar</a>}>
              {month.toLocaleDateString('en-GB', { month: 'long' })}
            </SectionHeading>
            <div className="card month-card">
              <MonthGrid
                month={month}
                items={data.items.filter(onCalendar)}
                selected={day}
                onSelect={(iso) => { location.hash = `#/calendar?d=${iso}` }}
              />
            </div>
          </section>

          {upcoming.length > 0 && (
            <section className="stack order-2">
              <SectionHeading
                count={upcoming.length}
                action={<a href="#/calendar" className="section-link">Calendar</a>}
              >
                Coming up
              </SectionHeading>
              {upcoming.map((i) => <UpcomingCard key={i.id} item={i} from={day} files={filesFor(i.id)} />)}
            </section>
          )}
        </div>
      </div>
    </>
  )
}

export { REMINDER_DAYS }
