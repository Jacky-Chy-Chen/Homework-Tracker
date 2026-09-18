import { useState } from 'react'
import { daysBetween, fmtTag, relative, todayISO } from '../lib/dates'
import { subjectColor } from '../lib/homework'
import type { Item } from '../lib/store'
import Icon from './Icon'

export const pad2 = (n: number) => String(n).padStart(2, '0')

export function Wordmark({ big }: { big?: boolean }) {
  return (
    <span className={`wordmark mono ${big ? 'big' : ''}`}>
      <span className="dim">~/</span>homework<span className="cursor" />
    </span>
  )
}

/** The small bar above each page: wordmark on the left, a label on the right. */
export function TopBar({ label, poster }: { label?: string; poster?: boolean }) {
  return (
    <div className="topbar">
      <Wordmark />
      {poster ? (
        <span className="mono topbar-label accent"><span className="dot" />POSTER</span>
      ) : (
        label && <span className="mono topbar-label">{label}</span>
      )}
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
    <span className="subject-label mono" style={{ color }}>
      <span className="swatch" style={{ background: color }} />
      {subject}
    </span>
  )
}

export function TypeTag({ type }: { type: Item['type'] }) {
  if (type === 'daily') return null
  return <span className={`tag mono tag-${type}`}>{type === 'test' ? 'TEST' : type === 'project' ? 'PROJECT' : 'OTHER'}</span>
}

function ItemExtras({ item }: { item: Item }) {
  return (
    <>
      {item.notes && <div className="card-notes">{item.notes}</div>}
      {item.link && (
        <a className="card-link mono" href={item.link} target="_blank" rel="noreferrer">
          <Icon name="link" size={14} />
          {item.link.replace(/^https?:\/\//, '').slice(0, 40)}
        </a>
      )}
    </>
  )
}

/** Card for one item: subject + due date on top, then the title. */
export function ItemCard({ item }: { item: Item }) {
  return (
    <div className="card">
      <div className="card-top">
        <span className="card-top-left">
          <TypeTag type={item.type} />
          <SubjectLabel subject={item.subject} />
        </span>
        <span className="mono muted small">DUE {fmtTag(item.due_date)}</span>
      </div>
      <div className="card-title">{item.title}</div>
      <ItemExtras item={item} />
    </div>
  )
}

/** Countdown timeline row used for projects and tests coming up. */
export function TimelineItem({ item, from }: { item: Item; from: string }) {
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
        <ItemExtras item={item} />
        <div className="mono dim small">DUE {fmtTag(item.due_date)}</div>
      </div>
    </div>
  )
}

/** Compact row with edit/delete, for the poster's list. */
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

export function MessageConsole({ text, reminders }: { text: string; reminders: number }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // WeChat's browser often blocks the async clipboard API; fall back to execCommand.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, text.length)
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
          <span>WECHAT PREVIEW</span>
          <span>{reminders === 0 ? 'NO REMINDERS' : `${reminders} REMINDER${reminders === 1 ? '' : 'S'} ADDED`}</span>
        </div>
        <textarea className="console-body mono" readOnly value={text} rows={text.split('\n').length} aria-label="Group chat message" />
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
