import { addDays, fmtShort, relative } from './dates'
import type { Item, ItemType } from './store'

/** How far ahead projects/tests show up as reminders. */
export const REMINDER_DAYS = 14

export const TYPE_LABEL: Record<ItemType, string> = {
  daily: 'Homework',
  project: 'Project',
  test: 'Test',
  other: 'Other',
}

const TYPE_EMOJI: Record<ItemType, string> = {
  daily: '📝',
  project: '📂',
  test: '🧪',
  other: '📌',
}

/** Homework posted on this day. */
export const assignedOn = (items: Item[], day: string) =>
  items.filter((i) => i.assigned_date === day)

/** Long-term things (not daily homework) due after this day, within the reminder window. */
export const upcomingFrom = (items: Item[], day: string) => {
  const limit = addDays(day, REMINDER_DAYS)
  return items
    .filter((i) => i.type !== 'daily' && i.assigned_date !== day && i.due_date > day && i.due_date <= limit)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
}

export const groupBySubject = (items: Item[]) => {
  const groups = new Map<string, Item[]>()
  for (const i of items) groups.set(i.subject, [...(groups.get(i.subject) ?? []), i])
  return [...groups.entries()]
}

/** The text pasted into the homeroom WeChat group. */
export function buildMessage(items: Item[], day: string) {
  const today = assignedOn(items, day)
  const upcoming = upcomingFrom(items, day)
  const lines: string[] = [`📚 Homework ${fmtShort(day)}`, '']

  if (today.length === 0) lines.push('No new homework today 🎉')
  for (const [subject, list] of groupBySubject(today)) {
    for (const i of list) {
      const tag = i.type === 'daily' ? '' : ` ${TYPE_EMOJI[i.type]}${TYPE_LABEL[i.type]}`
      lines.push(`【${subject}】${i.title}${tag} — due ${fmtShort(i.due_date)}`)
      if (i.notes) lines.push(`   ${i.notes}`)
    }
  }

  if (upcoming.length) {
    lines.push('', '⏰ Coming up:')
    for (const i of upcoming) {
      lines.push(`${TYPE_EMOJI[i.type]} ${i.subject} ${TYPE_LABEL[i.type].toLowerCase()}: ${i.title} — ${fmtShort(i.due_date)}, ${relative(day, i.due_date)}`)
    }
  }
  return lines.join('\n')
}

const PALETTE = ['#e0564b', '#e8913a', '#c9a227', '#4caf6a', '#2f9e9e', '#3b7ddd', '#6b5bd6', '#b84fb0', '#8a6d52', '#5f7480']

export function subjectColor(subject: string) {
  let h = 0
  for (const c of subject.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
