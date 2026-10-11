import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'

const { canManageNews, schoolToday, sortedNews, recentNews, currentGreetings, greetingsFromBirthdays, validateBirthday, validateNews, validateNewsImage } = await import('../src/lib/news.ts')
const { demoNewsStore, supabaseNewsStore, NewsCleanupError } = await import('../src/lib/news-store.ts')
const post = (id, published_on, pinned = false, category = 'announcement') => ({ id, published_on, pinned, category, title: id, body: 'News text', image_path: null, created_at: `${published_on}T12:00:00Z` })

test('news permission is independent of homework editor role', () => {
  for (const user of [null, { role: 'reader' }, { role: 'editor' }]) assert.equal(canManageNews(user), false)
  for (const user of [{ role: 'reader', news_manager: true }, { role: 'editor', news_manager: true }, { role: 'admin' }]) assert.equal(canManageNews(user), true)
})
test('school birthday clock rolls over at UTC+8 midnight, independent of viewer timezone', () => {
  assert.equal(schoolToday(new Date('2026-10-10T15:59:59Z')), '2026-10-10')
  assert.equal(schoolToday(new Date('2026-10-10T16:00:00Z')), '2026-10-11')
})
test('news has stable pinned-first order, category filters, no future posts and compact recent preview', () => {
  const items = [post('future', '2026-10-12', true), post('old', '2026-08-01'), post('old-pin', '2026-08-01', true), post('new', '2026-10-11'), post('win', '2026-10-10', false, 'achievement')]
  assert.deepEqual(sortedNews(items, '2026-10-11').map(n => n.id), ['old-pin', 'new', 'win', 'old'])
  assert.deepEqual(recentNews(items, '2026-10-11').map(n => n.id), ['old-pin', 'new', 'win'])
  assert.deepEqual(sortedNews(items, '2026-10-11', 'achievement').map(n => n.id), ['win'])
  assert.deepEqual(items.map(n => n.id), ['future', 'old', 'old-pin', 'new', 'win'])
})
test('greetings require consent and visibility, deduplicate and disappear next day', () => {
  const birthday = { id: 'a', display_name: 'Synthetic student A', birth_month: 10, birth_day: 11, consent_given: true, visible: true }
  const rows = [birthday, { ...birthday, id: 'b', display_name: 'Synthetic student B' }, { ...birthday, id: 'private', consent_given: false }, { ...birthday, id: 'hidden', visible: false }, { ...birthday, id: 'tomorrow', birth_day: 12 }]
  const greetings = greetingsFromBirthdays(rows, '2026-10-11')
  assert.equal(greetings.length, 2)
  assert.equal(currentGreetings([...greetings, ...greetings], '2026-10-11').length, 2)
  assert.equal(currentGreetings(greetings, '2026-10-12').length, 0)
  assert.equal(greetingsFromBirthdays([{ ...birthday, birth_month: 2, birth_day: 29 }], '2027-02-28').length, 0)
  assert.equal(greetingsFromBirthdays([{ ...birthday, birth_month: 2, birth_day: 29 }], '2028-02-29').length, 1)
  assert.deepEqual(Object.keys(greetings[0]).sort(), ['display_name', 'greeting_date', 'greeting_key'])
})
test('forms reject invalid dates, missing titles and enabled birthdays without consent', () => {
  const b = { display_name: 'Synthetic', birth_month: 2, birth_day: 29, consent_given: true, visible: true }
  assert.doesNotThrow(() => validateBirthday(b))
  assert.throws(() => validateBirthday({ ...b, birth_day: 30 }), /valid birth/)
  assert.throws(() => validateBirthday({ ...b, consent_given: false }), /Permission/)
  assert.throws(() => validateNews({ ...post('x', '2026-02-30'), title: 'x' }), /valid publication/)
  assert.throws(() => validateNews({ ...post('x', '2026-10-11'), title: '  ' }), /title/)
})
test('images reject SVG, oversized files and MIME/header mismatches', async () => {
  await assert.rejects(validateNewsImage(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })), /JPEG/)
  await assert.rejects(validateNewsImage(new File(['not an image'], 'x.png', { type: 'image/png' })), /format/)
  await assert.rejects(validateNewsImage(new File([new Uint8Array(6 * 1024 * 1024)], 'x.jpg', { type: 'image/jpeg' })), /5 MB/)
  await validateNewsImage(new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'header.png', { type: 'image/png' }))
})
test('demo managers can create/update news, but editors cannot write or fetch birthday roster', async () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  let user = { role: 'admin' }
  const store = demoNewsStore(async () => user, storage)
  assert.deepEqual(await store.list(), [])
  await store.save({ title: 'Synthetic announcement', body: 'For testing only.', category: 'announcement', published_on: schoolToday(), pinned: false })
  const saved = (await store.list())[0]
  await store.save({ ...saved, title: 'Updated synthetic announcement' }, saved)
  assert.equal((await store.list()).length, 1)
  const birthday = { display_name: 'Synthetic student', birth_month: Number(schoolToday().slice(5,7)), birth_day: Number(schoolToday().slice(8,10)), consent_given: true, visible: true }
  await store.saveBirthday(birthday)
  await assert.rejects(store.saveBirthday(birthday), /already recorded/)
  assert.equal((await store.greetings()).length, 1)
  assert.equal((await store.list()).length, 1) // Greetings never become stored news.
  user = { role: 'editor' }
  await assert.rejects(store.birthdays(), /news managers/)
  await assert.rejects(store.saveBirthday(birthday), /news managers/)
  await assert.rejects(store.save({ ...saved, title: 'Not permitted' }, saved), /news managers/)
  await assert.rejects(store.remove(saved), /news managers/)
})

test('failed news mutations clean up only the new upload; committed cleanup failures are distinct', async () => {
  const removed = []
  const file = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'synthetic.png', { type: 'image/png' })
  const existing = { ...post('existing', '2026-10-11'), image_path: 'old.png' }
  let mutationFails = true
  const client = {
    from: () => ({ update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: mutationFails ? null : { id: 'existing' }, error: mutationFails ? { message: 'Denied' } : null }) }) }) }) }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      remove: async paths => { removed.push(...paths); return { error: paths[0] === 'old.png' ? { message: 'Cleanup failed' } : null } },
    }) },
  }
  const store = supabaseNewsStore(client)
  await assert.rejects(store.save(existing, existing, file), /Denied/)
  assert.equal(removed.length, 1)
  assert.notEqual(removed[0], 'old.png')
  mutationFails = false
  await assert.rejects(store.save(existing, existing, file), NewsCleanupError)
  assert.equal(removed[1], 'old.png')
})
