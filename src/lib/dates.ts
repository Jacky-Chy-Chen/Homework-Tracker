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

/** Next school day: Fri/Sat → Monday, otherwise tomorrow. */
export const nextSchoolDay = (iso: string) => {
  const dow = parseISO(iso).getDay()
  return addDays(iso, dow === 5 ? 3 : dow === 6 ? 2 : 1)
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

export const relative = (from: string, to: string) => {
  const n = daysBetween(from, to)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** 'MON 21 SEP' — the mono date labels used across the UI. */
export const fmtTag = (iso: string) => {
  const d = parseISO(iso)
  return `${WEEKDAYS[d.getDay()].toUpperCase()} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** 'FRI · 18 SEP 2026' */
export const fmtEyebrow = (iso: string) => {
  const d = parseISO(iso)
  return `${WEEKDAYS[d.getDay()].toUpperCase()} · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
