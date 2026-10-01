// The class timetable: a fixed weekly grid, plus one-off changes attached to single dates.
// Subjects come from the codes on the printed timetable (BIO → Biology, E/ENG → English, …).

import { parseISO } from './dates'

export interface Period {
  n: number
  start: string
  end: string
  /** Wednesday is the only day with a 9th period. */
  wedOnly?: boolean
}

/** Bell times, SSBS 小学/初中. Period 5–6 on Friday keep these times; Friday ends after period 6. */
export const PERIODS: Period[] = [
  { n: 1, start: '8:30', end: '9:10' },
  { n: 2, start: '9:25', end: '10:05' },
  { n: 3, start: '10:20', end: '11:00' },
  { n: 4, start: '11:15', end: '11:55' },
  { n: 5, start: '12:40', end: '13:20' },
  { n: 6, start: '13:35', end: '14:15' },
  { n: 7, start: '14:30', end: '15:10' },
  { n: 8, start: '15:25', end: '16:05' },
  { n: 9, start: '16:15', end: '16:55', wedOnly: true },
]

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

/** G8 (5), room 307 — one entry per period 1–9, null where there is no class. */
export const DEFAULT_TIMETABLE: (string | null)[][] = [
  // Monday
  ['Biology', 'Chinese', 'Optional', 'Math', 'Civics', 'English', 'English', 'PE', null],
  // Tuesday
  ['Physics', 'Art', 'English', 'English', 'Chinese', 'PE', 'Math', 'Math', null],
  // Wednesday
  ['Chinese', 'Chinese', 'Math', 'PE', 'English', 'English', 'IT', 'Chemistry', 'Club'],
  // Thursday
  ['Biology', 'English', 'English', 'PE', 'History', 'Physics', 'Chinese', 'Math', null],
  // Friday
  ['Civics', 'Physics', 'English', 'English', 'Chinese', 'Math', null, null, null],
]

export const CLASS_INFO = { grade: 'G8 (5)', room: '307', teacher: '谢倩', term: '2026 · Term 1' }

/** A change to one period on one date. `subject: null` means the class is cancelled. */
export interface SlotChange {
  id: string
  date: string
  period: number
  subject: string | null
  /** The other period this one was swapped with, for the "swapped with period 6" label. */
  swapped_with: number | null
  note: string | null
}

export type Weekday = 0 | 1 | 2 | 3 | 4
/** Monday = 0 … Friday = 4; null at weekends. */
export const weekdayIndex = (iso: string): Weekday | null => {
  const d = parseISO(iso).getDay()
  return d >= 1 && d <= 5 ? ((d - 1) as Weekday) : null
}

export interface Slot {
  period: Period
  subject: string | null
  /** What the timetable says, when a change overrides it. */
  original?: string | null
  change?: SlotChange
}

/** The periods actually taught on a date, with any changes applied. */
export function daySlots(iso: string, timetable: (string | null)[][], changes: SlotChange[]): Slot[] {
  const wd = weekdayIndex(iso)
  if (wd === null) return []
  const row = timetable[wd] ?? []
  const onDate = changes.filter((c) => c.date === iso)
  return PERIODS.filter((p) => !p.wedOnly || wd === 2)
    .map((period) => {
      const original = row[period.n - 1] ?? null
      const change = onDate.find((c) => c.period === period.n)
      return change ? { period, subject: change.subject, original, change } : { period, subject: original }
    })
    .filter((s) => s.subject !== null || s.change)
}

/** One line per change, for the group-chat message: "Period 4 PE → Math". */
export function changeLines(slots: Slot[]): string[] {
  return slots
    .filter((s) => s.change)
    .map((s) => {
      const from = s.original ?? 'free'
      if (s.subject === null) return `Period ${s.period.n}: ${from} cancelled`
      if (s.change?.swapped_with) return `Period ${s.period.n}: ${s.subject} (swapped with period ${s.change.swapped_with})`
      return `Period ${s.period.n}: ${from} → ${s.subject}`
    })
}
