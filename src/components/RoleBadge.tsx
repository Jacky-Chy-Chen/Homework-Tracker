import type { Role } from '../lib/store'

const LABELS: Record<Role, string> = { admin: 'Admin', editor: 'Editor', reader: 'Reader' }
export default function RoleBadge({ role }: { role: Role }) {
  return <span className="pill-editor role-badge" data-role={role} aria-label={`Role: ${LABELS[role]}`}><span className="dot" aria-hidden="true" />{LABELS[role]}</span>
}
