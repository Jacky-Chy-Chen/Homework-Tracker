import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from './pagination'
import { canEditNote, canRemoveNote, validateNote, validateNoteFile, validateReport, type NoteInput, type NoteReport, type ReportCategory, type StudentNote } from './student-notes'

export interface StudentNotesStore {
  list(): Promise<StudentNote[]>
  save(input: NoteInput, existing?: StudentNote, file?: File | null): Promise<string | null>
  remove(note: StudentNote): Promise<string | null>
  fileUrl(note: StudentNote): Promise<string>
  report(noteId: string, category: ReportCategory, explanation: string): Promise<void>
  reports(): Promise<NoteReport[]>
  dismiss(reportId: string): Promise<void>
}
export class NotesSetupError extends Error {
  constructor() { super('Student Notes needs its database migration and secure upload function. An administrator must review and set them up first.') }
}
function check<T extends { error: { code?: string; message: string } | null }>(result: T): T {
  if (result.error) {
    if (['42P01','42883','PGRST202','PGRST205'].includes(result.error.code ?? '')) throw new NotesSetupError()
    if (result.error.code === '23505') throw new Error('You have already reported this note. An administrator will review it; each account can report a note once.')
    throw new Error(result.error.message)
  }
  return result
}
export function supabaseStudentNotesStore(sb: SupabaseClient): StudentNotesStore {
  return {
    async list() {
      const [notes, flagged] = await Promise.all([
        fetchAllPages<StudentNote>(async (from, to) => check(await sb.from('student_notes').select('*').order('created_at', { ascending: false }).order('id').range(from, to)).data ?? []),
        fetchAllPages<{ note_id: string }>(async (from, to) => check(await sb.rpc('student_note_review_status').order('note_id').range(from, to)).data ?? []),
      ])
      const ids = new Set(flagged.map(r => r.note_id))
      return notes.map(n => ({ ...n, under_review: ids.has(n.id) }))
    },
    async save(input, existing, file) {
      validateNote(input)
      if (file) {
        await validateNoteFile(file)
        const form = new FormData()
        form.set('title', input.title.trim()); form.set('subject', input.subject.trim()); form.set('description', input.description ?? '')
        if (existing) form.set('id', existing.id)
        form.set('file', file)
        const { data, error } = await sb.functions.invoke('upload-student-note', { body: form })
        if (error) {
          const context = (error as unknown as { context?: Response }).context
          let message = 'Upload failed. Check your connection and ask an administrator to verify the secure upload function, then retry.'
          if (context instanceof Response) {
            try { const body = await context.json(); if (typeof body.error === 'string') message = body.error } catch { /* retain useful fallback */ }
          }
          throw new Error(message)
        }
        if (!data?.id) throw new Error('The upload service did not confirm the note was saved. Reload before retrying.')
        return data.warning ?? null
      }
      if (!existing) throw new Error('Choose a file first.')
      check(await sb.from('student_notes').update({ title: input.title.trim(), subject: input.subject.trim(), description: input.description?.trim() || null }).eq('id', existing.id).select('id').single())
      return null
    },
    async remove(note) {
      // Avoid deleting newly replaced files using stale metadata.
      check(await sb.from('student_notes').delete().eq('id', note.id).eq('file_path', note.file_path).select('id').single())
      const cleanup = await sb.storage.from('student-notes').remove([note.file_path])
      return cleanup.error ? 'Note removed, but its unused file needs administrator cleanup.' : null
    },
    async fileUrl(note) { return check(await sb.storage.from('student-notes').createSignedUrl(note.file_path, 60, { download: note.file_name })).data!.signedUrl },
    async report(noteId, category, explanation) {
      validateReport(category, explanation)
      const { data: { user }, error } = await sb.auth.getUser()
      if (error || !user) throw new Error('Sign in to report an error.')
      check(await sb.from('student_note_reports').insert({ note_id: noteId, reporter_id: user.id, category, explanation: explanation.trim() || null }))
    },
    async reports() {
      return fetchAllPages<NoteReport>(async (from, to) => check(await sb.from('student_note_reports').select('*').is('dismissed_at', null).order('created_at').order('id').range(from, to)).data ?? [])
    },
    async dismiss(reportId) { check(await sb.from('student_note_reports').update({ dismissed_at: new Date().toISOString() }).eq('id', reportId).select('id').single()) },
  }
}

type DemoAccount = { id: string; role: string; name?: string | null }
export function demoStudentNotesStore(account: () => Promise<DemoAccount | null>, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): StudentNotesStore {
  const KEY = 'hw-demo-student-notes', REPORTS = 'hw-demo-note-reports'
  const read = <T>(key: string): T[] => JSON.parse(storage.getItem(key) ?? '[]')
  const write = (key: string, rows: unknown[]) => {
    try { storage.setItem(key, JSON.stringify(rows)) }
    catch { throw new Error('This browser has no room left. Remove an unused demo file and retry.') }
  }
  const requireUser = async () => { const a = await account(); if (!a) throw new Error('Sign in first.'); return a }
  const requireAdmin = async () => { const a = await requireUser(); if (a.role !== 'admin') throw new Error('Only administrators can review reports.'); return a }
  return {
    async list() {
      const reports = read<NoteReport>(REPORTS)
      return read<StudentNote>(KEY).map(n => ({ ...n, under_review: reports.some(r => r.note_id === n.id && !r.dismissed_at) })).sort((a,b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
    },
    async save(input, existing, file) {
      const user = await requireUser(); validateNote(input)
      const rows = read<StudentNote>(KEY), current = existing && rows.find(n => n.id === existing.id)
      if (existing && (!current || !canEditNote(user, current))) throw new Error('You can edit only your own notes. Reload if this note was removed.')
      let attachment = current && { file_path: current.file_path, file_name: current.file_name, file_type: current.file_type, file_size: current.file_size }
      if (file) {
        const { mime } = await validateNoteFile(file)
        if (file.size > 1_000_000) throw new Error('Demo files must be under 1 MB. Shared notes support up to 20 MB.')
        const file_path = await new Promise<string>((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read this file.')); r.readAsDataURL(file)
        })
        attachment = { file_path, file_name: file.name, file_type: mime, file_size: file.size }
      }
      if (!attachment) throw new Error('Choose a file first.')
      const row: StudentNote = { ...input, title: input.title.trim(), subject: input.subject.trim(), description: input.description?.trim() || null, ...attachment, id: current?.id ?? crypto.randomUUID(), owner_id: user.id, contributor: current?.contributor ?? (user.name?.trim().slice(0,80) || 'Student'), created_at: current?.created_at ?? new Date().toISOString() }
      write(KEY, current ? rows.map(n => n.id === current.id ? row : n) : [row,...rows]); return null
    },
    async remove(note) {
      const current = read<StudentNote>(KEY).find(n => n.id === note.id)
      if (!current || !canRemoveNote(await requireUser(), current)) throw new Error('You cannot remove this note.')
      write(KEY, read<StudentNote>(KEY).filter(n => n.id !== note.id))
      write(REPORTS, read<NoteReport>(REPORTS).filter(r => r.note_id !== note.id)); return null
    },
    async fileUrl(note) { const current = read<StudentNote>(KEY).find(n => n.id === note.id); if (!current) throw new Error('This note was removed.'); return current.file_path },
    async report(noteId, category, explanation) {
      const user = await requireUser(); validateReport(category, explanation)
      if (!read<StudentNote>(KEY).some(n => n.id === noteId)) throw new Error('This note was removed.')
      const rows = read<NoteReport>(REPORTS)
      if (rows.some(r => r.note_id === noteId && r.reporter_id === user.id)) throw new Error('You have already reported this note. Each account can report a note once.')
      write(REPORTS, [...rows, { id: crypto.randomUUID(), note_id: noteId, reporter_id: user.id, category, explanation: explanation.trim() || null, created_at: new Date().toISOString(), dismissed_at: null }])
    },
    async reports() { await requireAdmin(); return read<NoteReport>(REPORTS).filter(r => !r.dismissed_at) },
    async dismiss(id) { await requireAdmin(); const rows = read<NoteReport>(REPORTS); if (!rows.some(r => r.id === id)) throw new Error('This report was removed.'); write(REPORTS, rows.map(r => r.id === id ? { ...r, dismissed_at: new Date().toISOString() } : r)) },
  }
}
