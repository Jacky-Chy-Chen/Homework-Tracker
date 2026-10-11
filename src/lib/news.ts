export const NEWS_CATEGORIES = {
  announcement: 'Announcements', achievement: 'Achievements', birthday: 'Birthdays', other: 'Other',
} as const
export type NewsCategory = keyof typeof NEWS_CATEGORIES
export interface NewsItem {
  id: string
  title: string
  body: string
  category: NewsCategory
  published_on: string
  pinned: boolean
  image_path: string | null
  created_at: string
}
export type NewNews = Omit<NewsItem, 'id' | 'image_path' | 'created_at'>
export interface Birthday {
  id: string
  display_name: string
  birth_month: number
  birth_day: number
  consent_given: boolean
  visible: boolean
}
export type NewBirthday = Omit<Birthday, 'id'>
export interface BirthdayGreeting {
  greeting_key: string
  display_name: string
  greeting_date: string
}
export const canManageNews = (account: { role: string; news_manager?: boolean } | null) =>
  account?.role === 'admin' || account?.news_manager === true

/** One shared school clock; birthdays must not depend on the viewer's timezone. */
export function schoolToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function sortedNews(items: readonly NewsItem[], day: string, category?: NewsCategory) {
  return items.filter(n => n.published_on <= day && (!category || n.category === category))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.published_on.localeCompare(a.published_on) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}
export function recentNews(items: readonly NewsItem[], day: string, limit = 3) {
  return sortedNews(items, day).filter(n => n.pinned || n.published_on >= shiftDay(day, -30)).slice(0, limit)
}
function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
export function currentGreetings(greetings: readonly BirthdayGreeting[], day: string) {
  return [...new Map(greetings.filter(g => g.greeting_date === day).map(g => [g.greeting_key, g])).values()]
}
export function greetingsFromBirthdays(records: readonly Birthday[], day: string): BirthdayGreeting[] {
  const month = Number(day.slice(5, 7)), date = Number(day.slice(8, 10))
  return records.filter(b => b.consent_given && b.visible && b.birth_month === month && b.birth_day === date)
    .map(b => ({ greeting_key: `${b.id}:${day}`, display_name: b.display_name, greeting_date: day }))
}
export function validateNews(news: NewNews) {
  if (!news.title.trim() || news.title.trim().length > 160) throw new Error('Enter a title of 1–160 characters.')
  if (!news.body.trim() || news.body.trim().length > 10000) throw new Error('Enter news text of 1–10,000 characters.')
  if (!Object.prototype.hasOwnProperty.call(NEWS_CATEGORIES, news.category)) throw new Error('Choose a news category.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(news.published_on) || !Number.isFinite(Date.parse(news.published_on)) || new Date(`${news.published_on}T12:00:00Z`).toISOString().slice(0, 10) !== news.published_on) throw new Error('Choose a valid publication date.')
}
export function validateBirthday(b: NewBirthday) {
  if (!b.display_name.trim() || b.display_name.trim().length > 80) throw new Error('Enter a display name of 1–80 characters.')
  const date = new Date(Date.UTC(2000, b.birth_month - 1, b.birth_day))
  if (!Number.isInteger(b.birth_month) || !Number.isInteger(b.birth_day) || date.getUTCMonth() !== b.birth_month - 1 || date.getUTCDate() !== b.birth_day) throw new Error('Choose a valid birth month and day.')
  if (b.visible && !b.consent_given) throw new Error('Permission is required before showing a birthday greeting.')
}
export const NEWS_IMAGE_LIMIT = 5 * 1024 * 1024
export async function validateNewsImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size === 0 || file.size > NEWS_IMAGE_LIMIT) throw new Error('News images must be between 1 byte and 5 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isJPEG = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPNG = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  const isWebP = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!(file.type === 'image/jpeg' ? isJPEG : file.type === 'image/png' ? isPNG : isWebP)) throw new Error('That file does not match its image format.')
}
