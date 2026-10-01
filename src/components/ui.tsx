import { useState } from 'react'
import { dateTile, daysBetween, fmtDue, fmtTag, relative, todayISO } from '../lib/dates'
import { subjectColor, TYPE_LABEL } from '../lib/homework'
import { store, type Item, type Material } from '../lib/store'
import { toggleDone, useDone } from '../lib/done'
import { setTheme, useTheme } from '../lib/theme'
import Icon from './Icon'

export const APP_NAME = 'Classboard'
export const CLASS_LABEL = 'G8 (5)'

export function Wordmark({ big, subtitle = CLASS_LABEL }: { big?: boolean; subtitle?: string }) {
  return (
    <span className={`wordmark ${big ? 'big' : ''}`}>
      <span className="mark" aria-hidden="true">
        <Icon name="check" size={big ? 28 : 18} stroke={2.2} />
      </span>
      <span className="wordmark-text">
        <span className="wordmark-name">{APP_NAME}</span>
        {subtitle && <span className="wordmark-sub">{subtitle}</span>}
      </span>
    </span>
  )
}

/** Sun/moon switch. `row` is the sidebar version with a text label. */
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
    <button className="icon-btn quiet" onClick={() => setTheme(next)} aria-label={label} title={label}>
      {icon}
    </button>
  )
}

/** Wordmark on the left; the editor badge or a sign-in button on the right. */
export function TopBar({ editor }: { editor?: boolean }) {
  return (
    <div className="topbar">
      <Wordmark />
      <div className="topbar-right">
        {editor ? (
          <span className="pill-editor">
            <span className="dot" />
            Editor
          </span>
        ) : (
          <a className="icon-btn" href="#/post" aria-label="Sign in to post">
            <Icon name="user" size={19} stroke={1.8} />
          </a>
        )}
        <ThemeToggle />
      </div>
    </div>
  )
}

export function SectionHeading({ children, count, action }: { children: React.ReactNode; count?: number; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div className="section-heading-left">
        <h2>{children}</h2>
        {count !== undefined && <span className="count">{count}</span>}
      </div>
      {action}
    </div>
  )
}

export function SubjectLabel({ subject }: { subject: string }) {
  const color = subjectColor(subject)
  return (
    <span className="subject-label" style={{ '--c': color } as React.CSSProperties}>
      <span className="swatch" style={{ background: color }} />
      {subject}
    </span>
  )
}

export function TypeTag({ type }: { type: Item['type'] }) {
  if (type === 'daily') return null
  return <span className={`tag tag-${type}`}>{TYPE_LABEL[type]}</span>
}

function Attachments({ files }: { files: Material[] }) {
  return (
    <>
      {files.map((f) => (
        <a key={f.id} className="attachment" href={store.fileUrl(f)} target="_blank" rel="noreferrer">
          <Icon name="folder" size={14} />
          {f.title}
        </a>
      ))}
    </>
  )
}

/** Homework card: subject, due date, title, and the student's own tick. */
export function ItemCard({ item, files = [], tick }: { item: Item; files?: Material[]; tick?: boolean }) {
  const done = useDone().has(item.id)
  const today = todayISO()
  return (
    <div className={`card ${tick && done ? 'is-done' : ''}`}>
      {tick && (
        <button
          className={`tick ${done ? 'on' : ''}`}
          onClick={() => toggleDone(item.id)}
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${item.title}" as done`}
        >
          {done && <Icon name="check" size={13} stroke={3} />}
        </button>
      )}
      <div className="card-body">
        <div className="card-top">
          <span className="card-top-left">
            <TypeTag type={item.type} />
            <SubjectLabel subject={item.subject} />
          </span>
          <span className="due">{fmtDue(today, item.due_date)}</span>
        </div>
        <div className="card-title">{item.title}</div>
        {item.notes && <div className="card-notes">{item.notes}</div>}
        <Attachments files={files} />
        {item.link && (
          <a className="attachment" href={item.link} target="_blank" rel="noreferrer">
            <Icon name="link" size={14} />
            {item.link.replace(/^https?:\/\//, '').slice(0, 36)}
          </a>
        )}
      </div>
    </div>
  )
}

/** Card with a date tile, used for tests and projects that are still ahead. */
export function UpcomingCard({ item, from, files = [] }: { item: Item; from: string; files?: Material[] }) {
  const { month, day } = dateTile(item.due_date)
  const days = daysBetween(from, item.due_date)
  return (
    <div className={`card upcoming-card type-${item.type}`}>
      <div className="date-tile">
        <span className="date-tile-month">{month}</span>
        <span className="date-tile-day">{day}</span>
      </div>
      <div className="card-body">
        <div className="card-top-left">
          <TypeTag type={item.type} />
          <SubjectLabel subject={item.subject} />
        </div>
        <div className="card-title">{item.title}</div>
        {item.notes && <div className="card-notes">{item.notes}</div>}
        <Attachments files={files} />
        <div className="card-foot">
          Due {fmtTag(item.due_date)} · {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
        </div>
      </div>
    </div>
  )
}

/** Compact row with edit and delete, for the editor's lists. */
export function ItemRow({ item, onEdit, onDelete }: { item: Item; onEdit: () => void; onDelete: () => void }) {
  const today = todayISO()
  const due = item.due_date === today ? 'due today' : item.due_date < today ? relative(today, item.due_date) : fmtDue(today, item.due_date).toLowerCase()
  const meta = [item.subject, item.type === 'daily' ? null : TYPE_LABEL[item.type].toLowerCase(), due].filter(Boolean).join(' · ')
  return (
    <div className="row-item">
      <span className="swatch" style={{ background: subjectColor(item.subject) }} />
      <div className="row-item-text">
        <span className="row-item-title">{item.title}</span>
        <span className="row-item-meta">{meta}</span>
      </div>
      <button className="icon-btn quiet" onClick={onEdit} aria-label={`Edit ${item.title}`}>
        <Icon name="edit" size={17} stroke={1.8} />
      </button>
      <button className="icon-btn quiet danger" onClick={onDelete} aria-label={`Delete ${item.title}`}>
        <Icon name="trash" size={17} stroke={1.8} />
      </button>
    </div>
  )
}

/** The message the editor copies into the class group. */
export function MessageCard({ text, weekText, reminders }: { text: string; weekText: string; reminders: number }) {
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
      <SectionHeading
        action={
          <div className="switch">
            <button className={span === 'day' ? 'on' : ''} onClick={() => setSpan('day')}>Today</button>
            <button className={span === 'week' ? 'on' : ''} onClick={() => setSpan('week')}>Week</button>
          </div>
        }
      >
        Message for the group
      </SectionHeading>

      <div className="message-card">
        <div className="message-head">
          <span className="message-chat-icon"><Icon name="chat" size={13} stroke={2} /></span>
          <span className="message-head-label">Preview</span>
          {span === 'day' && reminders > 0 && (
            <span className="pill-warn">{reminders} reminder{reminders === 1 ? '' : 's'} added</span>
          )}
        </div>
        <textarea className="message-body" readOnly value={shown} rows={shown.split('\n').length} aria-label="Message for the class group" />
        <button className="btn-primary" onClick={copy}>
          <Icon name={status === 'copied' ? 'check' : 'copy'} size={18} stroke={2.1} />
          {status === 'copied' ? 'Copied' : 'Copy message'}
        </button>
        <p className="message-hint">
          {status === 'failed' ? "Couldn't copy automatically — long-press the text to copy it." : 'Paste it straight into the class group'}
        </p>
      </div>
    </section>
  )
}
