import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from './pagination'
import { canManageNews, greetingsFromBirthdays, schoolToday, validateBirthday, validateNews, validateNewsImage, type Birthday, type BirthdayGreeting, type NewBirthday, type NewNews, type NewsItem } from './news'

export interface NewsStore {
  list(): Promise<NewsItem[]>
  save(news: NewNews, existing?: NewsItem, image?: File | null, removeImage?: boolean): Promise<void>
  remove(news: NewsItem): Promise<void>
  imageUrl(path: string): Promise<string>
  greetings(): Promise<BirthdayGreeting[]>
  birthdays(): Promise<Birthday[]>
  saveBirthday(birthday: NewBirthday, id?: string): Promise<void>
  removeBirthday(id: string): Promise<void>
}
export class NewsSetupError extends Error {
  constructor() { super('Class News needs its database migration. An administrator must review and apply it first.') }
}
/** Metadata was committed; do not retry the whole save against stale image metadata. */
export class NewsCleanupError extends Error {}
type Result = { error: { message: string; code?: string } | null }
function check<T extends Result>(result: T): T {
  if (result.error) {
    if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(result.error.code ?? '')) throw new NewsSetupError()
    throw new Error(result.error.message)
  }
  return result
}
const BUCKET = 'news-images'
export function supabaseNewsStore(sb: SupabaseClient): NewsStore {
  const deleteImage = async (path: string) => {
    const result = await sb.storage.from(BUCKET).remove([path])
    if (result.error) throw new NewsCleanupError('The news change was saved, but its old image could not be removed. Ask an administrator to clean up the unused image.')
  }
  return {
    async list() {
      return fetchAllPages<NewsItem>(async (from, to) => {
        const { data } = check(await sb.from('class_news').select('*').order('published_on', { ascending: false }).order('id').range(from, to))
        return (data ?? []) as NewsItem[]
      })
    },
    async save(news, existing, image, removeImage = false) {
      validateNews(news)
      let uploaded: string | null = null
      let path = removeImage ? null : existing?.image_path ?? null
      if (image) {
        await validateNewsImage(image)
        const extension = image.type === 'image/jpeg' ? 'jpg' : image.type === 'image/png' ? 'png' : 'webp'
        uploaded = `${crypto.randomUUID()}.${extension}`
        check(await sb.storage.from(BUCKET).upload(uploaded, image, { contentType: image.type, upsert: false }))
        path = uploaded
      }
      try {
        const row = { ...news, title: news.title.trim(), body: news.body.trim(), image_path: path }
        check(existing
          ? await sb.from('class_news').update(row).eq('id', existing.id).select('id').single()
          : await sb.from('class_news').insert(row).select('id').single())
      } catch (error) {
        if (uploaded) {
          const cleanup = await sb.storage.from(BUCKET).remove([uploaded])
          if (cleanup.error) throw new Error(`${(error as Error).message} The unused upload also needs administrator cleanup.`)
        }
        throw error
      }
      if (existing?.image_path && existing.image_path !== path) await deleteImage(existing.image_path)
    },
    async remove(news) {
      check(await sb.from('class_news').delete().eq('id', news.id).select('id').single())
      if (news.image_path) await deleteImage(news.image_path)
    },
    async imageUrl(path) {
      return check(await sb.storage.from(BUCKET).createSignedUrl(path, 600)).data!.signedUrl
    },
    async greetings() {
      const { data } = check(await sb.rpc('today_birthday_greetings'))
      return (data ?? []) as BirthdayGreeting[]
    },
    async birthdays() {
      return fetchAllPages<Birthday>(async (from, to) => {
        const { data } = check(await sb.from('class_birthdays').select('id, display_name, birth_month, birth_day, consent_given, visible').order('display_name').order('id').range(from, to))
        return (data ?? []) as Birthday[]
      })
    },
    async saveBirthday(birthday, id) {
      validateBirthday(birthday)
      const row = { ...birthday, display_name: birthday.display_name.trim() }
      check(id
        ? await sb.from('class_birthdays').update(row).eq('id', id).select('id').single()
        : await sb.from('class_birthdays').insert(row).select('id').single())
    },
    async removeBirthday(id) {
      check(await sb.from('class_birthdays').delete().eq('id', id).select('id').single())
    },
  }
}

/** Demo records are deliberately empty: no invented classmates or birthdays. */
export function demoNewsStore(account: () => Promise<{ role: string; news_manager?: boolean } | null>, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): NewsStore {
  const read = <T>(key: string): T[] => JSON.parse(storage.getItem(key) ?? '[]') as T[]
  const write = (key: string, rows: unknown[]) => {
    try { storage.setItem(key, JSON.stringify(rows)) }
    catch { throw new Error('This browser has no room left to save news. Remove an unused demo image and try again.') }
  }
  const authorize = async () => {
    if (!canManageNews(await account())) throw new Error('Only administrators and news managers can manage Class News.')
  }
  const NEWS_KEY = 'hw-demo-news', BIRTHDAY_KEY = 'hw-demo-birthdays'
  return {
    async list() {
      const rows = read<NewsItem>(NEWS_KEY)
      return canManageNews(await account()) ? rows : rows.filter(n => n.published_on <= schoolToday())
    },
    async save(news, existing, image, removeImage = false) {
      await authorize()
      validateNews(news)
      let image_path = removeImage ? null : existing?.image_path ?? null
      if (image) {
        await validateNewsImage(image)
        if (image.size > 1_000_000) throw new Error('Demo images must be under 1 MB. Shared news images support up to 5 MB.')
        image_path = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('Could not read this image.'))
          reader.readAsDataURL(image)
        })
      }
      const row: NewsItem = { ...news, title: news.title.trim(), body: news.body.trim(), id: existing?.id ?? crypto.randomUUID(), image_path, created_at: existing?.created_at ?? new Date().toISOString() }
      const rows = read<NewsItem>(NEWS_KEY)
      if (existing && !rows.some(n => n.id === existing.id)) throw new Error('This post no longer exists. Reload the news list.')
      write(NEWS_KEY, existing ? rows.map(n => n.id === existing.id ? row : n) : [row, ...rows])
    },
    async remove(news) { await authorize(); write(NEWS_KEY, read<NewsItem>(NEWS_KEY).filter(n => n.id !== news.id)) },
    async imageUrl(path) { return path },
    async greetings() { return greetingsFromBirthdays(read<Birthday>(BIRTHDAY_KEY), schoolToday()) },
    async birthdays() { await authorize(); return read<Birthday>(BIRTHDAY_KEY) },
    async saveBirthday(birthday, id) {
      await authorize()
      validateBirthday(birthday)
      const rows = read<Birthday>(BIRTHDAY_KEY)
      if (rows.some(b => b.id !== id && b.display_name.trim().toLowerCase() === birthday.display_name.trim().toLowerCase() && b.birth_month === birthday.birth_month && b.birth_day === birthday.birth_day)) throw new Error('That birthday is already recorded. Use a distinct display name for a namesake.')
      if (id && !rows.some(b => b.id === id)) throw new Error('This birthday no longer exists. Reload the list.')
      const row = { ...birthday, display_name: birthday.display_name.trim(), id: id ?? crypto.randomUUID() }
      write(BIRTHDAY_KEY, id ? rows.map(b => b.id === id ? row : b) : [...rows, row])
    },
    async removeBirthday(id) { await authorize(); write(BIRTHDAY_KEY, read<Birthday>(BIRTHDAY_KEY).filter(b => b.id !== id)) },
  }
}
