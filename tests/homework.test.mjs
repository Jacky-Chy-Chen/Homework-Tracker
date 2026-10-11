import assert from 'node:assert/strict'
import './typescript-loader.mjs'
import test from 'node:test'

const { homeworkForDay, deadlinesAfter, buildMessage, buildWeekMessage, onCalendar } = await import('../src/lib/homework.ts')
const { nextSchoolDay } = await import('../src/lib/dates.ts')
const { fetchAllPages } = await import('../src/lib/pagination.ts')
const { academicMonthCells, eventsOn, eventsInMonth, shiftAcademicMonth, academicRangeLabel } = await import('../src/lib/academic-calendar.ts')
const { ACADEMIC_EVENTS } = await import('../src/lib/academic-events.ts')
const { isSchoolDay, holidayOn, holidayRange } = await import('../src/lib/holidays.ts')

test('winter break is inclusive and next-school-day skips its entire month', () => {
  for (const day of ['2027-01-23', '2027-02-01', '2027-02-21']) assert.equal(isSchoolDay(day), false)
  assert.equal(isSchoolDay('2027-01-22'), true)
  assert.equal(isSchoolDay('2027-02-22'), true)
  for (const day of ['2027-01-22', '2027-01-23', '2027-02-01', '2027-02-21']) assert.equal(nextSchoolDay(day), '2027-02-22')
  assert.equal(holidayRange(holidayOn('2027-02-01')), '23 Jan–21 Feb')
  assert.equal(isSchoolDay('2026-10-10'), true)
  assert.equal(isSchoolDay('2026-11-04'), true)
  assert.equal(homeworkForDay([], '2027-01-22', '2027-01-22').dueDate, '2027-02-22')
})

test('event ranges include boundaries and category filtering without mutating input', () => {
  const events = [
    { id: 'exam', title: 'Exam', start: '2027-01-02', end: '2027-01-03', category: 'exam' },
    { id: 'holiday', title: 'Break', start: '2026-12-30', end: '2027-01-02', category: 'holiday' },
  ]
  assert.deepEqual(eventsOn(events, '2027-01-02').map(e => e.id), ['holiday', 'exam'])
  assert.deepEqual(eventsOn(events, '2027-01-02', 'exam').map(e => e.id), ['exam'])
  assert.equal(eventsOn(events, '2026-12-29').length, 0)
  assert.equal(eventsOn(events, '2027-01-04').length, 0)
  assert.deepEqual(events.map(e => e.id), ['exam', 'holiday'])
  assert.equal(eventsInMonth(events, new Date(2026, 11, 1)).length, 1)
  assert.equal(eventsInMonth(events, new Date(2027, 0, 1)).length, 2)
  assert.equal(eventsInMonth(events, new Date(2027, 1, 1)).length, 0)
})

test('academic month grid is Monday-first and includes leap days and six-week months', () => {
  for (const [year, month, length] of [[2024, 1, 35], [2026, 7, 42], [2026, 11, 35]]) {
    const cells = academicMonthCells(new Date(year, month, 1))
    assert.equal(cells.length, length)
    assert.equal(new Date(`${cells[0].iso}T12:00:00`).getDay(), 1)
    assert.equal(new Set(cells.map(c => c.iso)).size, length)
    assert.equal(cells.filter(c => c.inMonth).length, new Date(year, month + 1, 0).getDate())
  }
  assert.ok(academicMonthCells(new Date(2024, 1, 1)).some(c => c.iso === '2024-02-29' && c.inMonth))
})

test('month navigation clamps dates and crosses years', () => {
  assert.equal(shiftAcademicMonth('2027-01-31', 1), '2027-02-28')
  assert.equal(shiftAcademicMonth('2024-01-31', 1), '2024-02-29')
  assert.equal(shiftAcademicMonth('2026-12-31', 1), '2027-01-31')
  assert.equal(shiftAcademicMonth('2027-01-01', -1), '2026-12-01')
})

test('approved calendar has 11 unique events and winter break spans two months', () => {
  assert.equal(ACADEMIC_EVENTS.length, 11)
  assert.equal(new Set(ACADEMIC_EVENTS.map(e => e.id)).size, 11)
  assert.ok(ACADEMIC_EVENTS.every(e => e.start <= e.end))
  assert.equal(eventsInMonth(ACADEMIC_EVENTS, new Date(2026, 10, 1)).length, 3)
  assert.equal(eventsOn(ACADEMIC_EVENTS, '2027-02-21')[0].id, 'winter-holiday-2027')
  assert.equal(eventsOn(ACADEMIC_EVENTS, '2027-02-22').length, 0)
  assert.equal(academicRangeLabel(eventsOn(ACADEMIC_EVENTS, '2027-02-01')[0]), '23 Jan 2027 – 21 Feb 2027')
})

const item = (id, due_date, type = 'daily', assigned_date = '2026-10-08') => ({
  id, title: id, subject: 'Math', type, due_date, assigned_date, notes: null, link: null,
})

test('today includes every type due next school day, but excludes today and past work', () => {
  const items = ['daily', 'project', 'test', 'other'].map(type => item(type, '2026-10-12', type))
  items.push(item('submitted', '2026-10-11'), item('past', '2026-10-09'))
  const result = homeworkForDay(items, '2026-10-11', '2026-10-11')
  assert.equal(result.dueDate, '2026-10-12')
  assert.deepEqual(result.items.map(i => i.id), ['daily', 'project', 'test', 'other'])
})

test('next-school-day selection respects weekends, holidays and make-up Saturdays', () => {
  for (const [today, due] of [
    ['2026-10-16', '2026-10-19'],
    ['2026-09-30', '2026-10-08'],
    ['2026-10-09', '2026-10-10'],
    ['2026-10-10', '2026-10-12'],
  ]) {
    assert.equal(nextSchoolDay(today), due)
    assert.equal(homeworkForDay([], today, today).dueDate, due)
  }
})

test('past and future date selections keep their exact-day behavior', () => {
  const items = [item('past', '2026-10-09'), item('future', '2026-10-20'), item('next', '2026-10-12')]
  for (const [day, id] of [['2026-10-09', 'past'], ['2026-10-20', 'future']]) {
    const result = homeworkForDay(items, day, '2026-10-11')
    assert.equal(result.dueDate, day)
    assert.deepEqual(result.items.map(i => i.id), [id])
  }
})

test('coming up includes all types and distant deadlines, ordered and grouped without overlaps', () => {
  const items = [
    item('distant', '2027-06-01', 'project'),
    item('test', '2026-10-14', 'test'),
    item('homework', '2026-10-13', 'daily', '2026-10-11'),
    item('other', '2026-10-14', 'other'),
    item('next', '2026-10-12'),
    item('submitted', '2026-10-11'),
    item('past', '2026-10-08'),
  ]
  const before = items.map(i => i.id)
  const handIns = homeworkForDay(items, '2026-10-11', '2026-10-11')
  const groups = deadlinesAfter(items, handIns.dueDate)
  assert.deepEqual(groups.map(([date]) => date), ['2026-10-13', '2026-10-14', '2027-06-01'])
  assert.deepEqual(groups[1][1].map(i => i.id), ['test', 'other'])
  const laterIds = groups.flatMap(([, list]) => list.map(i => i.id))
  assert.equal(laterIds.length, 4)
  assert.equal(new Set(laterIds).size, 4)
  assert.ok(handIns.items.every(i => !laterIds.includes(i.id)))
  assert.deepEqual(items.map(i => i.id), before)
})

test('empty lists and cutoffs across years have predictable results', () => {
  assert.deepEqual(deadlinesAfter([], '2026-10-12'), [])
  assert.deepEqual(homeworkForDay([], '2026-10-11', '2026-10-11').items, [])
  const items = [item('same-day', '2026-12-31'), item('new-year', '2027-01-01')]
  assert.deepEqual(deadlinesAfter(items, '2026-12-31').map(([date]) => date), ['2027-01-01'])
})

test('WeChat keeps its 14-day reminders, assigned-today items and timetable changes', () => {
  const items = [
    item('worksheet', '2026-10-12', 'daily', '2026-10-11'),
    item('test', '2026-10-15', 'test'),
    item('distant', '2027-06-01', 'project'),
    item('later-homework', '2026-10-14'),
  ]
  assert.equal(buildMessage(items, '2026-10-11', ['Period 4: PE → Math'], 'Mon 12 Oct'),
    '📚 Homework 10/11 (Sun)\n\n【Math】worksheet — due 10/12 (Mon)\n\n🔄 Timetable Mon 12 Oct:\n• Period 4: PE → Math\n\n⏰ Coming up:\n🧪 Math test: test — 10/15 (Thu), in 4 days')
  assert.equal(buildWeekMessage(items, '2026-10-12'),
    '🗓 Week of 10/12 (Mon)\n\n📝 10/14 (Wed) 【Math】later-homework\n🧪 10/15 (Thu) 【Math】test (test)')
  assert.equal(onCalendar(items[0]), false)
  assert.equal(onCalendar(items[3]), true)
})

test('pagination retrieves more than 1000 items, even with a smaller server cap', async () => {
  const source = Array.from({ length: 1203 }, (_, id) => ({ id }))
  for (const cap of [500, 137]) {
    const loaded = await fetchAllPages(async (from, to) => source.slice(from, Math.min(to + 1, from + cap)))
    assert.deepEqual(loaded, source)
  }
})

test('pagination returns empty data and propagates errors instead of partial results', async () => {
  assert.deepEqual(await fetchAllPages(async () => []), [])
  await assert.rejects(fetchAllPages(async from => {
    if (from === 0) return [item('first', '2026-10-12')]
    throw new Error('Could not fetch next page')
  }), /Could not fetch next page/)
})
