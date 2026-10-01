import { useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import MonthGrid from '../components/MonthGrid'
import { ItemCard, MessageConsole, pad2, SectionLabel, TimelineItem, TopBar } from '../components/ui'
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
      <TopBar label="CLASS FEED" editor={!!data.user} />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow mono">
            {fmtEyebrow(day)}
            {!isToday && <span className="eyebrow-rel"> · {relative(today, day).toUpperCase()}</span>}
          </div>
          <h1>{isToday ? "Today's homework" : fmtLong(day)}</h1>
        </div>
        <div className="head-actions">
          {!isToday && (
            <button className="btn-ghost mono" onClick={() => setDay(today)}>TODAY</button>
          )}
          <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            <Icon name="left" />
          </button>
          <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
            <Icon name="right" />
          </button>
          {data.user && (
            <a href="#/post" className="btn-primary desktop-only">
              <Icon name="plus" size={16} stroke={2.4} />
              New entry
            </a>
          )}
        </div>
      </header>

      {!data.loading && (
        <div className="status mono">
          <span><span className="dot" />{posted.length} new</span>
          <span><span className="dot dot-test" />{upcoming.length} due within {REMINDER_DAYS} days</span>
        </div>
      )}

      <div className="today-grid">
        <div className="col">
          <section className="stack order-1">
            <SectionLabel right={pad2(posted.length)}>{isToday ? 'NEW TODAY' : 'POSTED THIS DAY'}</SectionLabel>
            {data.loading ? (
              <div className="empty mono">Loading…</div>
            ) : posted.length === 0 ? (
              <div className="empty mono">No homework posted for this day.</div>
            ) : (
              posted.map((i) => <ItemCard key={i.id} item={i} files={filesFor(i.id)} tick />)
            )}
          </section>

          {data.user && !data.loading && (
            <div className="order-3">
              <MessageConsole
                text={buildMessage(data.items, day, swaps, fmtTag(nextDay))}
                weekText={buildWeekMessage(data.items, nextMonday)}
                reminders={upcoming.length}
              />
            </div>
          )}
        </div>

        <div className="col">
          <section className="card mini-cal desktop-only">
            <div className="mini-cal-head">
              <span className="mini-cal-title">
                {month.toLocaleDateString('en-US', { month: 'long' })}
                <span className="mono muted small">{month.getFullYear()}</span>
              </span>
              <a href="#/calendar" className="mono accent small">OPEN CALENDAR →</a>
            </div>
            <MonthGrid month={month} items={data.items.filter(onCalendar)} />
          </section>

          {upcoming.length > 0 && (
            <section className="stack order-2">
              <SectionLabel right={pad2(upcoming.length)}>COMING UP · {REMINDER_DAYS} DAYS</SectionLabel>
              <div className="timeline">
                {upcoming.map((i) => <TimelineItem key={i.id} item={i} from={day} files={filesFor(i.id)} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
