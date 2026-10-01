import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDays, nextSchoolDay, todayISO } from './dates'
import { DEFAULT_TIMETABLE, type SlotChange } from './schedule'

export type ItemType = 'daily' | 'project' | 'test' | 'other'

export interface Item {
  id: string
  title: string
  subject: string
  type: ItemType
  assigned_date: string
  due_date: string
  notes: string | null
  link: string | null
}

export type NewItem = Omit<Item, 'id'>

export interface Material {
  id: string
  title: string
  subject: string
  notes: string | null
  file_name: string
  file_size: number
  file_type: string
  /** Where the file lives: a Storage path, or a data URL in demo mode. */
  file_path: string
  item_id: string | null
  created_at: string
}

export type NewMaterial = Omit<Material, 'id' | 'created_at' | 'file_path' | 'file_name' | 'file_size' | 'file_type'>

export type Timetable = (string | null)[][]

export interface Store {
  mode: 'supabase' | 'demo'
  list(): Promise<Item[]>
  add(item: NewItem): Promise<void>
  update(id: string, item: NewItem): Promise<void>
  remove(id: string): Promise<void>
  /** The weekly grid, as last saved (falls back to the printed timetable). */
  timetable(): Promise<Timetable>
  saveTimetable(grid: Timetable): Promise<void>
  /** One-off changes, from `from` onwards. */
  changes(from: string): Promise<SlotChange[]>
  addChanges(rows: Omit<SlotChange, 'id'>[]): Promise<void>
  clearChanges(date: string, periods: number[]): Promise<void>
  materials(): Promise<Material[]>
  addMaterial(meta: NewMaterial, file: File): Promise<void>
  removeMaterial(m: Material): Promise<void>
  /** A URL the browser can open for this material. */
  fileUrl(m: Material): string
  /** Signed-in email, or null. Demo mode is always "signed in". */
  currentUser(): Promise<string | null>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
// Supabase's own snippets call it the publishable key now; older ones say anon key.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

const BUCKET = 'materials'

function supabaseStore(sb: SupabaseClient): Store {
  const check = <T extends { error: { message: string } | null }>(res: T) => {
    if (res.error) throw new Error(res.error.message)
    return res
  }
  return {
    mode: 'supabase',
    async list() {
      const { data } = check(await sb.from('items').select('*').order('due_date'))
      return (data ?? []) as Item[]
    },
    async add(item) {
      check(await sb.from('items').insert(item))
    },
    async update(id, item) {
      check(await sb.from('items').update(item).eq('id', id))
    },
    async remove(id) {
      check(await sb.from('items').delete().eq('id', id))
    },
    async timetable() {
      const { data } = check(await sb.from('timetable').select('grid').eq('id', 1).maybeSingle())
      return (data?.grid as Timetable) ?? DEFAULT_TIMETABLE
    },
    async saveTimetable(grid) {
      check(await sb.from('timetable').upsert({ id: 1, grid }))
    },
    async changes(from) {
      const { data } = check(await sb.from('schedule_changes').select('*').gte('date', from).order('date'))
      return (data ?? []) as SlotChange[]
    },
    async addChanges(rows) {
      check(await sb.from('schedule_changes').insert(rows))
    },
    async clearChanges(date, periods) {
      check(await sb.from('schedule_changes').delete().eq('date', date).in('period', periods))
    },
    async materials() {
      const { data } = check(await sb.from('materials').select('*').order('created_at', { ascending: false }))
      return (data ?? []) as Material[]
    },
    async addMaterial(meta, file) {
      const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (up.error) throw new Error(up.error.message)
      check(
        await sb.from('materials').insert({
          ...meta,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        }),
      )
    },
    async removeMaterial(m) {
      check(await sb.from('materials').delete().eq('id', m.id))
      await sb.storage.from(BUCKET).remove([m.file_path])
    },
    fileUrl(m) {
      return sb.storage.from(BUCKET).getPublicUrl(m.file_path).data.publicUrl
    },
    async currentUser() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.email ?? null
    },
    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }))
    },
    async signOut() {
      await sb.auth.signOut()
    },
  }
}

const DEMO_ITEMS = 'hw-demo-items'
const DEMO_GRID = 'hw-demo-timetable'
const DEMO_CHANGES = 'hw-demo-changes'
const DEMO_MATERIALS = 'hw-demo-materials'
/** Demo files live in localStorage as data URLs, so keep them small. */
const DEMO_FILE_LIMIT = 1_000_000

function demoSeed(): Item[] {
  const t = todayISO()
  const mk = (i: number, p: Omit<Item, 'id' | 'notes' | 'link'> & Partial<Item>): Item => ({
    id: `demo-${i}`,
    notes: null,
    link: null,
    ...p,
  })
  return [
    mk(1, { title: 'Worksheet 3.2, #1–20', subject: 'Math', type: 'daily', assigned_date: t, due_date: nextSchoolDay(t) }),
    mk(2, { title: 'Read chapter 5 and annotate', subject: 'English', type: 'daily', assigned_date: t, due_date: nextSchoolDay(t) }),
    mk(3, { title: 'Unit 2 test', subject: 'Chemistry', type: 'test', assigned_date: addDays(t, -5), due_date: addDays(t, 4), notes: 'Covers atomic structure + periodic trends' }),
    mk(4, { title: 'Group research project', subject: 'History', type: 'project', assigned_date: addDays(t, -10), due_date: addDays(t, 9), notes: 'Slides + 5 min presentation. Groups of 4.' }),
    mk(5, { title: 'Vocab list 4', subject: 'English', type: 'daily', assigned_date: addDays(t, -1), due_date: t }),
    mk(6, { title: 'Lab write-up', subject: 'Physics', type: 'daily', assigned_date: t, due_date: addDays(t, 5), notes: 'Full results table and conclusion' }),
  ]
}

function demoStore(): Store {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw) as T
    } catch {}
    return fallback
  }
  const write = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      throw new Error('This browser has no room left to save. Delete something and try again.')
    }
  }
  const loadItems = (): Item[] => {
    const saved = read<Item[] | null>(DEMO_ITEMS, null)
    if (saved) return saved
    const seed = demoSeed()
    write(DEMO_ITEMS, seed)
    return seed
  }
  const id = () => `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return {
    mode: 'demo',
    async list() {
      return loadItems().sort((a, b) => a.due_date.localeCompare(b.due_date))
    },
    async add(item) {
      write(DEMO_ITEMS, [...loadItems(), { ...item, id: id() }])
    },
    async update(itemId, item) {
      write(DEMO_ITEMS, loadItems().map((i) => (i.id === itemId ? { ...item, id: itemId } : i)))
    },
    async remove(itemId) {
      write(DEMO_ITEMS, loadItems().filter((i) => i.id !== itemId))
    },
    async timetable() {
      return read<Timetable>(DEMO_GRID, DEFAULT_TIMETABLE)
    },
    async saveTimetable(grid) {
      write(DEMO_GRID, grid)
    },
    async changes(from) {
      return read<SlotChange[]>(DEMO_CHANGES, []).filter((c) => c.date >= from)
    },
    async addChanges(rows) {
      write(DEMO_CHANGES, [...read<SlotChange[]>(DEMO_CHANGES, []), ...rows.map((r) => ({ ...r, id: id() }))])
    },
    async clearChanges(date, periods) {
      write(DEMO_CHANGES, read<SlotChange[]>(DEMO_CHANGES, []).filter((c) => !(c.date === date && periods.includes(c.period))))
    },
    async materials() {
      return read<Material[]>(DEMO_MATERIALS, [])
    },
    async addMaterial(meta, file) {
      if (file.size > DEMO_FILE_LIMIT) {
        throw new Error('Demo mode can only hold files under 1 MB. Connect Supabase for real uploads.')
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('Could not read that file.'))
        r.readAsDataURL(file)
      })
      const row: Material = {
        ...meta,
        id: id(),
        file_path: dataUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        created_at: new Date().toISOString(),
      }
      write(DEMO_MATERIALS, [row, ...read<Material[]>(DEMO_MATERIALS, [])])
    },
    async removeMaterial(m) {
      write(DEMO_MATERIALS, read<Material[]>(DEMO_MATERIALS, []).filter((x) => x.id !== m.id))
    },
    fileUrl(m) {
      return m.file_path
    },
    async currentUser() {
      return 'demo'
    },
    async signIn() {},
    async signOut() {},
  }
}

export const store: Store = url && key ? supabaseStore(createClient(url, key)) : demoStore()
