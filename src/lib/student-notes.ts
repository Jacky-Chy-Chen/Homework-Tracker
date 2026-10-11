export { NOTE_FILE_LIMIT, NOTE_ACCEPT, NOTE_TYPES, REPORT_CATEGORIES, validateNote, validateNoteFile, validateReport } from '../../supabase/functions/_shared/note-validation'
export type { NoteInput, ReportCategory } from '../../supabase/functions/_shared/note-validation'
export interface StudentNote {
  id: string; owner_id: string; contributor: string; title: string; subject: string
  description: string | null; file_path: string; file_name: string; file_type: string
  file_size: number; created_at: string; under_review?: boolean
}
export interface NoteReport {
  id: string; note_id: string; reporter_id: string; category: import('./student-notes').ReportCategory
  explanation: string | null; created_at: string; dismissed_at: string | null
}
export const canEditNote = (account: { id: string } | null, note: StudentNote) => !!account && account.id === note.owner_id
export const canRemoveNote = (account: { id: string; role: string } | null, note: StudentNote) => canEditNote(account, note) || account?.role === 'admin'
