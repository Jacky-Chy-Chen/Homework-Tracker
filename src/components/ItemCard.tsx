import { fmtShort, relative, todayISO } from '../lib/dates'
import { subjectColor, TYPE_LABEL } from '../lib/homework'
import type { Item } from '../lib/store'

interface Props {
  item: Item
  /** Hide the subject chip when the card already sits under a subject heading. */
  hideSubject?: boolean
  actions?: React.ReactNode
}

export default function ItemCard({ item, hideSubject, actions }: Props) {
  const today = todayISO()
  const overdue = item.due_date < today
  return (
    <div className={`card type-${item.type}`}>
      <div className="card-top">
        {!hideSubject && (
          <span className="subject" style={{ background: subjectColor(item.subject) }}>
            {item.subject}
          </span>
        )}
        {item.type !== 'daily' && <span className={`badge badge-${item.type}`}>{TYPE_LABEL[item.type]}</span>}
        <span className={`due ${overdue ? 'past' : ''}`}>
          Due {fmtShort(item.due_date)} · {relative(today, item.due_date)}
        </span>
      </div>
      <div className="title">{item.title}</div>
      {item.notes && <div className="notes">{item.notes}</div>}
      {item.link && (
        <a className="link" href={item.link} target="_blank" rel="noreferrer">
          🔗 {item.link.replace(/^https?:\/\//, '').slice(0, 40)}
        </a>
      )}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  )
}
