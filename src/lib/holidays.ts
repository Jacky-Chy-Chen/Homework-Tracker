// China's public holidays, as set each year by the State Council. The 2026 dates
// below come from 国办发明电〔2025〕7 号 (published 4 November 2025).
// A new notice comes out each autumn for the following year: add its dates here
// and nothing else needs changing. Keep every list in date order.
//
// No imports here on purpose, so dates.ts can use this file.

export interface Holiday {
  name: string
  /** First and last day off, inclusive. */
  from: string
  to: string
}

export const HOLIDAYS: Holiday[] = [
  { name: "New Year's Day", from: '2026-01-01', to: '2026-01-03' },
  { name: 'Spring Festival', from: '2026-02-15', to: '2026-02-23' },
  { name: 'Qingming Festival', from: '2026-04-04', to: '2026-04-06' },
  { name: 'Labour Day', from: '2026-05-01', to: '2026-05-05' },
  { name: 'Dragon Boat Festival', from: '2026-06-19', to: '2026-06-21' },
  { name: 'Mid-Autumn Festival', from: '2026-09-25', to: '2026-09-27' },
  { name: 'National Day', from: '2026-10-01', to: '2026-10-07' },
]

/** 调休: a weekend worked to pay for a longer break. */
export const MAKEUP_DAYS: { date: string; name: string }[] = [
  { date: '2026-01-04', name: "New Year's Day" },
  { date: '2026-02-14', name: 'Spring Festival' },
  { date: '2026-02-28', name: 'Spring Festival' },
  { date: '2026-05-09', name: 'Labour Day' },
  { date: '2026-09-20', name: 'National Day' },
  { date: '2026-10-10', name: 'National Day' },
]

export const holidayOn = (iso: string) => HOLIDAYS.find((h) => iso >= h.from && iso <= h.to) ?? null

export const makeupOn = (iso: string) => MAKEUP_DAYS.find((m) => m.date === iso) ?? null

const isWeekend = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow === 0 || dow === 6
}

/** A day the class is actually at school: a weekday off holiday, or a make-up day. */
export const isSchoolDay = (iso: string) => (makeupOn(iso) ? true : !isWeekend(iso) && !holidayOn(iso))

/** The day the break starts on, for 'National Day · 1–7 Oct'. */
export const holidayRange = (h: Holiday) => `${h.from.slice(8)}–${h.to.slice(8)} ${MONTHS[Number(h.to.slice(5, 7)) - 1]}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
