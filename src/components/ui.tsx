import { useState } from 'react'
import { daysBetween, fmtTag, relative, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import { store, type Item, type Material } from '../lib/store'
import { toggleDone, useDone } from '../lib/done'
import { setTheme, useTheme } from '../lib/theme'
import Icon from './Icon'

export const pad2 = (n: number) => String(n).padStart(2, '0')

export function Wordmark({ big }: { big?: boolean }) {
  return (
    <span className={`wordmark mono ${big ? 'big' : ''}`}>
      <span className="dim">~/</span>homework
    </span>
  )
}

/** Sun/moon button. `row` is the sidebar version with a text label. */
export function ThemeToggle({ row }: { row?: boolean }) {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = `Switch to ${next} mode`
  const icon = <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={row ? 18 : 19} stroke={1.8} />
  return row ? (
    <button className="theme-row" onClick={() => setTheme(next)}>
      {icon}
      {next === 'light' ? 'Light mode' : 'Dark mode'}
    </button>
  ) : (
    <button className="icon-btn ghost theme-btn" onClick={() => setTheme(next)} aria-label={label} title={label}>
      {icon}
    </button>
  )
}

/** The small bar above each page: wordmark on the left, a label and the theme toggle on the right. */
export function TopBar({ label, editor }: { label?: string; editor?: boolean }) {
  return (
    <div className="topbar">
      <Wordmark />
      <span className="topbar-right">
        {editor ? (
          <span className="mono topbar-label accent"><span className="dot" />EDITOR</span>
        ) : (
          label && <span className="mono topbar-label">{label}</span>
        )}
        <ThemeToggle />
      </span>
    </div>
  )
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="section-label mono">
      <span>// {children}</span>
      {right !== undefined && <span>{right}</span>}
    </div>
  )
}

export function SubjectLabel({ subject }: { subject: string }) {
  const color = subjectColor(subject)
  return (
    <span className="subject-label mono" style={{ '--c': color } as React.CSSProperties}>
      <span className="swatch" style={{ background: color }} />
      {subject}
    </span>
  )
}

export function TypeTag({ type }: { type: Item['type'] }) {
  if (type === 'daily') return null
  return <span className={`tag mono tag-${type}`}>{type === 'test' ? 'TEST' : type === 'project' ? 'PROJECT' : 'OTHER'}</span>
}

function ItemExtras({ item, files = [] }: { item: Item; files?: Material[] }) {
  return (
    <>
      {item.notes && <div className="card-notes">{item.notes}</div>}
      {files.map((f) => (
        <a key={f.id} className="card-link mono" href={store.fileUrl(f)} target="_blank" rel="noreferrer">
          <Icon name="folder" size={14} />
          {f.title}
        </a>
      ))}
      {item.link && (
        <a className="card-link mono" href={item.link} target="_blank" rel="noreferrer">
          <Icon name="link" size={14} />
          {item.link.replace(/^https?:\/\//, '').slice(0, 40)}
        </a>
      )}
    </>
  )
}

/** Card for one item: subject + due date on top, then the title.
    `tick` adds the personal done checkbox (saved in this browser only). */
export function ItemCard({ item, files, tick }: { item: Item; files?: Material[]; tick?: boolean }) {
  const done = useDone().has(item.id)
  return (
    <div className={`card ${tick && done ? 'is-done' : ''}`}>
      <div className="card-top">
        <span className="card-top-left">
          <TypeTag type={item.type} />
          <SubjectLabel subject={item.subject} />
        </span>
        <span className="mono muted small">DUE {fmtTag(item.due_date)}</span>
      </div>
      <div className="card-main">
        {tick && (
          <button
            className={`tick ${done ? 'on' : ''}`}
            onClick={() => toggleDone(item.id)}
            role="checkbox"
            aria-checked={done}
            aria-label={`Mark "${item.title}" as done`}
          >
            {done && <Icon name="check" size={14} stroke={3} />}
          </button>
        )}
        <div className="card-title">{item.title}</div>
      </div>
      <ItemExtras item={item} files={files} />
    </div>
  )
}

/** Countdown timeline row used for projects and tests coming up. */
export function TimelineItem({ item, from, files }: { item: Item; from: string; files?: Material[] }) {
  const days = daysBetween(from, item.due_date)
  return (
    <div className="tl-row">
      <div className="tl-rail">
        <span className={`tl-count mono ${item.type === 'test' ? 'is-test' : 'is-accent'}`}>{days}</span>
        <span className="tl-unit mono">{days === 1 ? 'DAY' : 'DAYS'}</span>
        <span className="tl-line" />
      </div>
      <div className="card tl-card">
        <div className="card-top-left">
          <TypeTag type={item.type} />
          <SubjectLabel subject={item.subject} />
        </div>
        <div className="card-title">{item.title}</div>
        <ItemExtras item={item} files={files} />
        <div className="mono dim small">DUE {fmtTag(item.due_date)}</div>
      </div>
    </div>
  )
}

/** Compact row with edit/delete, for the editor's list. */
export function ItemRow({ item, onEdit, onDelete }: { item: Item; onEdit: () => void; onDelete: () => void }) {
  const today = todayISO()
  const due = item.due_date === today ? 'DUE TODAY' : item.due_date < today ? `DUE ${relative(today, item.due_date).toUpperCase()}` : fmtTag(item.due_date)
  const meta = [item.subject.toUpperCase(), item.type === 'daily' ? null : item.type.toUpperCase(), due].filter(Boolean).join(' · ')
  return (
    <div className="row-item">
      <span className="swatch" style={{ background: subjectColor(item.subject) }} />
      <div className="row-item-text">
        <span className="row-item-title">{item.title}</span>
        <span className="mono muted xsmall">{meta}</span>
      </div>
      <button className="icon-btn ghost" onClick={onEdit} aria-label={`Edit ${item.title}`}>
        <Icon name="edit" size={17} stroke={1.8} />
      </button>
      <button className="icon-btn ghost danger" onClick={onDelete} aria-label={`Delete ${item.title}`}>
        <Icon name="trash" size={17} stroke={1.8} />
      </button>
    </div>
  )
}

export function MessageConsole({ text, weekText, reminders }: { text: string; weekText: string; reminders: number }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [span, setSpan] = useState<'day' | 'week'>('day')
  const shown = span === 'day' ? text : weekText

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(shown)
      ok = true
    } catch {
      // WeChat's browser often blocks the async clipboard API; fall back to execCommand.
      const ta = document.createElement('textarea')
      ta.value = shown
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, shown.length)
      try {
        ok = document.execCommand('copy')
      } catch {}
      document.body.removeChild(ta)
    }
    setStatus(ok ? 'copied' : 'failed')
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <section className="stack">
      <SectionLabel right="AUTO-GENERATED">GROUP MESSAGE</SectionLabel>
      <div className="console">
        <div className="console-head mono">
          <span className="span-switch">
            <button className={span === 'day' ? 'on' : ''} onClick={() => setSpan('day')}>TODAY</button>
            <button className={span === 'week' ? 'on' : ''} onClick={() => setSpan('week')}>NEXT WEEK</button>
          </span>
          <span>{span === 'week' ? 'WEEK PREVIEW' : reminders === 0 ? 'NO REMINDERS' : `${reminders} REMINDER${reminders === 1 ? '' : 'S'} ADDED`}</span>
        </div>
        <textarea className="console-body mono" readOnly value={shown} rows={shown.split('\n').length} aria-label="Group chat message" />
      </div>
      <button className="btn-primary" onClick={copy}>
        <Icon name={status === 'copied' ? 'check' : 'copy'} size={18} stroke={2.1} />
        {status === 'copied' ? 'Copied' : 'Copy message'}
      </button>
      <div className="mono dim small center">
        {status === 'failed' ? "Couldn't copy automatically — long-press the text above." : 'Paste straight into the class group'}
      </div>
    </section>
  )
}
