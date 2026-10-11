import { parseISO, toISO } from './dates'

export const EVENT_CATEGORIES = {
  term: 'Term dates',
  holiday: 'Holidays',
  exam: 'Examinations',
  event: 'School events',
  parents: 'Parent meetings',
} as const

export type EventCategory = keyof typeof EVENT_CATEGORIES

export interface AcademicEvent {
  id: string
  title: string
  start: string
  end: string
  category: EventCategory
  audience?: string
  description?: string
}

export function eventsOn(events: readonly AcademicEvent[], day: string, category?: EventCategory) {
  return events.filter(e => e.start <= day && e.end >= day && (!category || e.category === category))
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}

export function eventsInMonth(events: readonly AcademicEvent[], month: Date, category?: EventCategory) {
  const from = toISO(new Date(month.getFullYear(), month.getMonth(), 1))
  const to = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  return events.filter(e => e.start <= to && e.end >= from && (!category || e.category === category))
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}

/** Monday-first grid; preserve leap days and ranges spanning a month or year. */
export function academicMonthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return { iso: toISO(date), day: date.getDate(), inMonth: date.getMonth() === first.getMonth() }
  })
  return cells.slice(35).every(c => !c.inMonth) ? cells.slice(0, 35) : cells
}

/** Move the selected date with month navigation, clamping the day if necessary. */
export function shiftAcademicMonth(selected: string, amount: number) {
  const date = parseISO(selected)
  const month = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return toISO(new Date(month.getFullYear(), month.getMonth(), Math.min(date.getDate(), lastDay)))
}

export function academicDateLabel(day: string) {
  return parseISO(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function academicRangeLabel(event: AcademicEvent) {
  const format = (day: string) => parseISO(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return event.start === event.end ? format(event.start) : `${format(event.start)} – ${format(event.end)}`
}
