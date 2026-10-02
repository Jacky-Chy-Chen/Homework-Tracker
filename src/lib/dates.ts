import { isSchoolDay } from './holidays'

// All dates are local calendar days stored as 'YYYY-MM-DD' strings.

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = () => toISO(new Date())

export const addDays = (iso: string, n: number) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string) =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)

/** The next day the class is at school, stepping over weekends and holidays. */
export const nextSchoolDay = (iso: string) => {
  let d = addDays(iso, 1)
  // A long holiday plus its weekends is nine days at most; stop either way.
  for (let i = 0; i < 20 && !isSchoolDay(d); i++) d = addDays(d, 1)
  return d
}

export const weekday = (iso: string) => WEEKDAYS[parseISO(iso).getDay()]

/** '9/18 (Fri)' */
export const fmtShort = (iso: string) => {
  const d = parseISO(iso)
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`
}

/** 'Friday, September 18' */
export const fmtLong = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

/** A page heading: 'Wed, Oct 14'. The full date sits above it. */
export const fmtHead = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export const relative = (from: string, to: string) => {
  const n = daysBetween(from, to)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Mon 21 Sep' — the short date shown on cards. */
export const fmtTag = (iso: string) => {
  const d = parseISO(iso)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** 'Thursday, 1 October 2026' */
export const fmtEyebrow = (iso: string) => {
  const d = parseISO(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** How a due date reads on a card: 'Due tomorrow', 'Due Tue 6 Oct'. */
export const fmtDue = (from: string, to: string) => {
  const n = daysBetween(from, to)
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n === -1) return 'Due yesterday'
  if (n < 0) return `Was due ${fmtTag(to)}`
  return `Due ${fmtTag(to)}`
}

/** The date tile on an upcoming card: { month: 'OCT', day: '5' }. */
export const dateTile = (iso: string) => {
  const d = parseISO(iso)
  return { month: MONTHS[d.getMonth()].toUpperCase(), day: String(d.getDate()) }
}
