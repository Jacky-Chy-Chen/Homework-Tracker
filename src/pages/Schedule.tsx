import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../App'
import Icon from '../components/Icon'
import { SectionLabel, TopBar } from '../components/ui'
import { addDays, fmtTag, parseISO, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import { CLASS_INFO, DAY_NAMES, daySlots, PERIODS, weekdayIndex } from '../lib/schedule'
import { store, type Timetable } from '../lib/store'

/** Monday of the week containing `iso` (weekends look ahead to the coming Monday). */
function mondayOf(iso: string) {
  const d = parseISO(iso)
  const dow = d.getDay()
  return addDays(iso, dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow)
}

export default function Schedule({ data }: { data: AppData }) {
  const today = todayISO()
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [editing, setEditing] = useState<{ date: string; period: number } | null>(null)

  const days = [0, 1, 2, 3, 4].map((n) => addDays(weekStart, n))
  const rows = PERIODS.filter((p) => !p.wedOnly || true)
  const weekChanges = data.changes.filter((c) => c.date >= weekStart && c.date <= addDays(weekStart, 4))

  const slotsFor = (date: string) => daySlots(date, data.timetable, data.changes)
  const thisWeek = weekStart === mondayOf(today)

  return (
    <>
      <TopBar label="SCHEDULE" editor={!!data.user} />

      <header className="page-head">
        <div className="page-head-text">
          <div className="eyebrow mono">{CLASS_INFO.grade} · ROOM {CLASS_INFO.room} · {CLASS_INFO.term}</div>
          <h1>{thisWeek ? 'This week' : `Week of ${fmtTag(weekStart)}`}</h1>
        </div>
        <div className="head-actions">
          {!thisWeek && <button className="btn-ghost mono" onClick={() => setWeekStart(mondayOf(today))}>THIS WEEK</button>}
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><Icon name="left" /></button>
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><Icon name="right" /></button>
        </div>
      </header>

      {data.user && (
        <p className="mono dim small hint-line">
          <Icon name="edit" size={13} stroke={1.8} />
          Tap any class to swap, replace or cancel it.
        </p>
      )}

      <div className="week-scroll">
        <div className="week">
          <div className="week-head mono" />
          {days.map((d) => (
            <div key={d} className={`week-head mono ${d === today ? 'is-today' : ''}`}>
              <span>{DAY_NAMES[weekdayIndex(d)!].slice(0, 3).toUpperCase()}</span>
              <span className="dim">{parseISO(d).getDate()}</span>
            </div>
          ))}

          {rows.map((p) => {
            const cells = days.map((d) => slotsFor(d).find((s) => s.period.n === p.n))
            // The 9th period only exists on Wednesday; hide the row if nothing uses it.
            if (cells.every((c) => !c)) return null
            return (
              <div key={p.n} className="week-row" style={{ display: 'contents' }}>
                <div className="period-cell mono">
                  <span className="period-n">{p.n}</span>
                  <span className="dim xsmall">{p.start}</span>
                </div>
                {days.map((d, i) => {
                  const slot = cells[i]
                  if (!slot) return <div key={d} className="class-cell empty-cell" />
                  const changed = !!slot.change
                  const cancelled = slot.subject === null
                  const color = slot.subject ? subjectColor(slot.subject) : 'var(--dim)'
                  const body = (
                    <>
                      <span className="class-name" style={{ color }}>{slot.subject ?? 'Cancelled'}</span>
                      {changed && (
                        <span className="class-was mono">
                          {slot.change?.swapped_with ? `↔ P${slot.change.swapped_with}` : `was ${slot.original ?? '—'}`}
                        </span>
                      )}
                    </>
                  )
                  const cls = `class-cell ${changed ? 'changed' : ''} ${cancelled ? 'cancelled' : ''} ${d === today ? 'today-col' : ''}`
                  return data.user ? (
                    <button key={d} className={cls} onClick={() => setEditing({ date: d, period: p.n })}>{body}</button>
                  ) : (
                    <div key={d} className={cls}>{body}</div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {weekChanges.length > 0 && (
        <section className="stack changes-list">
          <SectionLabel right={String(weekChanges.length).padStart(2, '0')}>CHANGES THIS WEEK</SectionLabel>
          {days.filter((d) => weekChanges.some((c) => c.date === d)).map((d) => (
            <div key={d} className="card">
              <div className="mono small muted">{fmtTag(d)}</div>
              {slotsFor(d).filter((s) => s.change).map((s) => (
                <div key={s.period.n} className="change-line">
                  <span className="mono dim">P{s.period.n}</span>
                  <span>
                    {s.original ?? 'free'} → <strong>{s.subject ?? 'cancelled'}</strong>
                    {s.change?.swapped_with ? ` (swapped with period ${s.change.swapped_with})` : ''}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {editing && (
        <SlotEditor
          date={editing.date}
          period={editing.period}
          data={data}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

type Mode = 'swap' | 'replace' | 'cancel'

function SlotEditor({ date, period, data, onClose }: { date: string; period: number; data: AppData; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('swap')
  const [withPeriod, setWithPeriod] = useState<number | null>(null)
  const [subject, setSubject] = useState('')
  const [forever, setForever] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const wd = weekdayIndex(date)!
  const slots = daySlots(date, data.timetable, data.changes)
  const slot = slots.find((s) => s.period.n === period)
  const known = useMemo(
    () => [...new Set(data.timetable.flat().filter(Boolean) as string[])].sort(),
    [data.timetable],
  )
  const others = slots.filter((s) => s.period.n !== period)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = async () => {
    setBusy(true)
    setErr(null)
    try {
      const grid: Timetable = data.timetable.map((r) => [...r])
      if (mode === 'swap') {
        if (!withPeriod) throw new Error('Pick the period to swap with.')
        const other = slots.find((s) => s.period.n === withPeriod)!
        if (forever) {
          grid[wd][period - 1] = other.subject
          grid[wd][withPeriod - 1] = slot?.subject ?? null
          await store.saveTimetable(grid)
        } else {
          await store.clearChanges(date, [period, withPeriod])
          await store.addChanges([
            { date, period, subject: other.subject, swapped_with: withPeriod, note: null },
            { date, period: withPeriod, subject: slot?.subject ?? null, swapped_with: period, note: null },
          ])
        }
      } else if (mode === 'replace') {
        if (!subject.trim()) throw new Error('Type the new subject.')
        if (forever) {
          grid[wd][period - 1] = subject.trim()
          await store.saveTimetable(grid)
        } else {
          await store.clearChanges(date, [period])
          await store.addChanges([{ date, period, subject: subject.trim(), swapped_with: null, note: null }])
        }
      } else {
        if (forever) {
          grid[wd][period - 1] = null
          await store.saveTimetable(grid)
        } else {
          await store.clearChanges(date, [period])
          await store.addChanges([{ date, period, subject: null, swapped_with: null, note: null }])
        }
      }
      await data.reloadSchedule()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      const pair = slot?.change?.swapped_with
      await store.clearChanges(date, pair ? [period, pair] : [period])
      await data.reloadSchedule()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Change class" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="stack gap-sm">
            <span className="mono dim small">{fmtTag(date)} · PERIOD {period} · {PERIODS[period - 1].start}–{PERIODS[period - 1].end}</span>
            <strong className="sheet-title">{slot?.subject ?? 'No class'}</strong>
          </div>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={20} stroke={2} /></button>
        </div>

        <div className="seg seg-3" role="radiogroup" aria-label="What to do">
          {(['swap', 'replace', 'cancel'] as Mode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'swap' ? 'Swap' : m === 'replace' ? 'Replace' : 'Cancel'}
            </button>
          ))}
        </div>

        {mode === 'swap' && (
          <div className="field">
            <span className="field-label mono">SWAP WITH</span>
            <div className="chips">
              {others.map((s) => (
                <button
                  key={s.period.n}
                  className={`chip mono ${withPeriod === s.period.n ? 'on' : ''}`}
                  aria-pressed={withPeriod === s.period.n}
                  onClick={() => setWithPeriod(s.period.n)}
                >
                  P{s.period.n} {s.subject ?? 'free'}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'replace' && (
          <div className="field">
            <span className="field-label mono">NEW SUBJECT</span>
            <div className="chips">
              {known.map((s) => (
                <button key={s} className={`chip mono ${subject === s ? 'on' : ''}`} aria-pressed={subject === s} onClick={() => setSubject(s)}>
                  <span className="swatch" style={{ background: subjectColor(s) }} />{s}
                </button>
              ))}
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Or type something else" />
          </div>
        )}

        {mode === 'cancel' && <p className="lead small">No class in this period — the students get a free period.</p>}

        <div className="field">
          <span className="field-label mono">APPLY TO</span>
          <div className="seg seg-2">
            <button className={!forever ? 'on' : ''} onClick={() => setForever(false)}>Just this day</button>
            <button className={forever ? 'on' : ''} onClick={() => setForever(true)}>Every week</button>
          </div>
          <span className="mono dim xsmall">
            {forever ? 'Changes the normal timetable from now on.' : `Only ${fmtTag(date)}. Next week stays normal.`}
          </span>
        </div>

        {err && <div className="alert error">{err}</div>}

        <div className="form-actions">
          {slot?.change && <button className="btn-secondary" onClick={reset} disabled={busy}>Reset</button>}
          <button className="btn-primary" onClick={apply} disabled={busy}>
            {busy ? 'Saving…' : 'Apply'}
            {!busy && <Icon name="check" size={18} stroke={2.2} />}
          </button>
        </div>
      </div>
    </div>
  )
}
