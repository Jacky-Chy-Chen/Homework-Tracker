import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import React from 'react'
import renderer, { act } from 'react-test-renderer'
import assert from 'node:assert/strict'
import test from 'node:test'

// Exercise the real editor without a browser, screen access, or a Supabase connection.
const storeUrl = new URL('../src/lib/store.ts', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    let resolved
    try { resolved = next(specifier, context) }
    catch (error) {
      if (!specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error
      resolved = next(`${specifier}.tsx`, context)
    }
    return resolved.url === storeUrl ? { url: 'test:subject-store', shortCircuit: true } : resolved
  },
  load(url, context, next) {
    if (url === 'test:subject-store') return { format: 'module', shortCircuit: true, source: 'export const store = globalThis.subjectStore;' }
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code }
    return next(url, context)
  },
})
const writes = []
globalThis.window = { innerWidth: 1440, scrollTo() {} }
globalThis.subjectStore = {
  mode: 'local',
  add: async item => writes.push({ item }),
  update: async (id, item) => writes.push({ id, item }),
}
const { default: Post } = await import('../src/pages/Post.tsx')
const { SUBJECT_CLASSES, SUBJECT_SETS, subjectOptionLabel, subjectColor } = await import('../src/lib/homework.ts')

// Independent expectations catch incorrect teacher assignments in the shared mapping.
const expected = [
  ['EC(H)', 'ECH', 'Mr. Song'], ['EC(S+1)', 'ECS+1', 'Ms. Tong'],
  ['EC(S+2)', 'ECS+2', 'Ms. Kim'], ['EC(S)', 'ECS', 'Ms. Monica'],
  ['EE(H)', 'EEH', 'Ms. Sydnie'], ['EE(S+1)', 'EES+1', 'Ms. Grace'],
  ['EE(S+2)', 'EES+2', 'Mr. Meehan'], ['EE(S)', 'EES', 'Mr. Joe'],
  ['Math(S+1)', 'Math S+1', '张老师'], ['Math(S+2)', 'Math S+2', '陈老师'],
  ['Math(S+3)', 'Math S+3', '韩老师'], ['Math(S)', 'Math S', '陈老师'],
]
const label = ([, name, teacher]) => `${name} · ${teacher}`
const text = node => typeof node === 'string' ? node : node.children.map(text).join('')
const button = (root, name) => root.root.findAllByType('button').find(node => text(node) === name)
const groups = root => root.root.findAll(node => node.type === 'div' && node.props.role === 'group')
const fixture = items => ({
  editor: true, user: { id: 'editor', name: 'Editor', role: 'editor' },
  timetable: [['EC', 'EE', 'Math', 'Physics']], items,
  reload: async () => {}, signOut: async () => {},
})
async function mount(data = fixture([])) {
  let root
  await act(async () => { root = renderer.create(React.createElement(Post, { data })) })
  return root
}
async function click(node) {
  assert.ok(node, 'expected button exists')
  await act(async () => node.props.onClick())
}
async function submit(root) {
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }))
}

test('all 12 class names and teachers map to unchanged stored values and colors', () => {
  assert.equal(Object.keys(SUBJECT_CLASSES).length, 12)
  assert.deepEqual(new Set(SUBJECT_SETS.flatMap(group => group.options)), new Set(expected.map(([value]) => value)))
  for (const entry of expected) {
    const [value, className, teacher] = entry
    assert.deepEqual(SUBJECT_CLASSES[value], { className, teacher })
    assert.equal(subjectOptionLabel(value), label(entry))
    assert.equal(subjectColor(value), subjectColor(value.split('(')[0]))
  }
  for (const custom of ['Physics', 'Robotics club', 'toString', '__proto__', 'ECH']) {
    assert.equal(subjectOptionLabel(custom), custom)
  }
})

test('all groups toggle and all classes select/save original values at phone, tablet and desktop widths', async () => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    window.innerWidth = width
    const root = await mount()
    try {
      await act(async () => root.root.findByProps({ placeholder: 'Worksheet 3.2, #1–20' }).props.onChange({ target: { value: 'Practice' } }))
      for (const group of SUBJECT_SETS) {
        await click(button(root, group.label))
        assert.equal(groups(root)[0].props['aria-label'], `${group.label} classes`)
        assert.equal(button(root, group.label).props['aria-expanded'], true)
        assert.deepEqual(groups(root)[0].findAllByType('button').map(text), expected.filter(([value]) => group.options.includes(value)).map(label))
        await click(button(root, group.label))
        assert.equal(groups(root).length, 0)
        for (const value of group.options) {
          const entry = expected.find(([stored]) => stored === value)
          await click(button(root, group.label))
          await click(button(root, label(entry)))
          assert.equal(groups(root).length, 0)
          const selected = button(root, label(entry))
          assert.match(selected.props.className, /\bon\b/)
          assert.equal(selected.props.style.borderColor, subjectColor(value))
          assert.equal(root.root.findAllByProps({ 'aria-label': 'New subject' }).length, 0)
          await submit(root)
          assert.equal(writes.at(-1).item.subject, value)
        }
      }
      // Opening another group replaces the previous one rather than stacking panels.
      await click(button(root, 'EC'))
      await click(button(root, 'Math'))
      assert.equal(groups(root).length, 1)
      assert.equal(groups(root)[0].props['aria-label'], 'Math classes')
    } finally { await act(async () => root.unmount()) }
  }
})

test('editing each existing class identifies its teacher, preserves the record and saves its stored value', async () => {
  const items = expected.map(([subject], index) => Object.freeze({
    id: `existing-${index}`, subject, title: `Practice ${index}`, type: 'daily',
    assigned_date: '2026-10-01', due_date: '2099-10-19', notes: 'Keep notes', link: null,
  }))
  const before = JSON.stringify(items)
  const data = fixture(items)
  const root = await mount(data)
  try {
    for (const [index, entry] of expected.entries()) {
      const item = items[index]
      await click(root.root.findByProps({ 'aria-label': `Edit ${item.title}` }))
      assert.match(button(root, label(entry)).props.className, /\bon\b/)
      const group = SUBJECT_SETS.find(group => group.options.includes(item.subject))
      await click(button(root, label(entry)))
      assert.equal(groups(root)[0].props['aria-label'], `${group.label} classes`)
      assert.equal(groups(root)[0].findAllByType('button').find(node => text(node) === label(entry)).props['aria-pressed'], true)
      await click(groups(root)[0].findAllByType('button').find(node => text(node) === label(entry)))
      await submit(root)
      assert.deepEqual(writes.at(-1), { id: item.id, item: Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id')) })
    }
    assert.equal(JSON.stringify(data.items), before)
  } finally { await act(async () => root.unmount()) }
})

test('New creates custom subjects and existing custom subjects remain editable', async () => {
  const item = { id: 'custom', subject: 'Robotics club', title: 'Build', type: 'project', assigned_date: '2026-10-01', due_date: '2099-10-19', notes: null, link: null }
  const root = await mount(fixture([item]))
  try {
    await click(button(root, 'EC'))
    await click(button(root, 'New'))
    assert.equal(groups(root).length, 0)
    await act(async () => {
      root.root.findByProps({ 'aria-label': 'New subject' }).props.onChange({ target: { value: 'Astronomy club' } })
      root.root.findByProps({ placeholder: 'Worksheet 3.2, #1–20' }).props.onChange({ target: { value: 'Observe' } })
    })
    await submit(root)
    assert.equal(writes.at(-1).item.subject, 'Astronomy club')
    await click(root.root.findByProps({ 'aria-label': 'Edit Build' }))
    assert.equal(button(root, 'Robotics club').props['aria-pressed'], true)
    await submit(root)
    assert.equal(writes.at(-1).item.subject, 'Robotics club')
    assert.equal(writes.at(-1).id, 'custom')
  } finally { await act(async () => root.unmount()) }
})

test('responsive selector CSS wraps full labels while retaining fixed icons and 44px targets', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.chips\s*\{[^}]*flex-wrap:\s*wrap/)
  assert.match(css, /\.chip\s*\{[^}]*min-height:\s*44px/)
  assert.match(css, /\.subject-selector \.chip\s*\{[^}]*max-width:\s*100%[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/)
  assert.match(css, /\.subject-selector \.chip svg\s*\{[^}]*flex-shrink:\s*0/)
})
