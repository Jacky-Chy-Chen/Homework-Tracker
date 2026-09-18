import { createClient } from '@supabase/supabase-js'
import { addDays, nextSchoolDay, todayISO } from './dates'

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

export interface Store {
  mode: 'supabase' | 'demo'
  list(): Promise<Item[]>
  add(item: NewItem): Promise<void>
  update(id: string, item: NewItem): Promise<void>
  remove(id: string): Promise<void>
  /** Signed-in email, or null. Demo mode is always "signed in". */
  currentUser(): Promise<string | null>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function supabaseStore(url: string, key: string): Store {
  const sb = createClient(url, key)
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

const DEMO_KEY = 'hw-demo-items'

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
  ]
}

function demoStore(): Store {
  const load = (): Item[] => {
    try {
      const raw = localStorage.getItem(DEMO_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    const seed = demoSeed()
    save(seed)
    return seed
  }
  const save = (items: Item[]) => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(items))
    } catch {}
  }
  return {
    mode: 'demo',
    async list() {
      return load().sort((a, b) => a.due_date.localeCompare(b.due_date))
    },
    async add(item) {
      save([...load(), { ...item, id: `demo-${Date.now()}` }])
    },
    async update(id, item) {
      save(load().map((i) => (i.id === id ? { ...item, id } : i)))
    },
    async remove(id) {
      save(load().filter((i) => i.id !== id))
    },
    async currentUser() {
      return 'demo'
    },
    async signIn() {},
    async signOut() {},
  }
}

export const store: Store = url && key ? supabaseStore(url, key) : demoStore()
