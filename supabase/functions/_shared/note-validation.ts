// Shared format checks, not antivirus. The upload service repeats these checks.
export const NOTE_FILE_LIMIT = 20 * 1024 * 1024
export const NOTE_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
export const NOTE_ACCEPT = Object.keys(NOTE_TYPES).map(e => `.${e}`).join(',')
export const REPORT_CATEGORIES = { incorrect: 'Incorrect information', missing: 'Missing information', subject: 'Wrong subject/category', inappropriate: 'Inappropriate content', other: 'Other' } as const
export type ReportCategory = keyof typeof REPORT_CATEGORIES
export interface NoteInput { title: string; subject: string; description: string | null }
export function validateNote(input: NoteInput) {
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) throw new Error('Enter a title of 1–160 characters.')
  if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.trim().length > 80) throw new Error('Enter a subject of 1–80 characters.')
  if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 2000)) throw new Error('Keep the description under 2,000 characters.')
}
export function validateReport(category: string, explanation: string) {
  if (!Object.prototype.hasOwnProperty.call(REPORT_CATEGORIES, category)) throw new Error('Choose a report category.')
  if (typeof explanation !== 'string' || explanation.length > 2000) throw new Error('Keep your explanation under 2,000 characters.')
}
export async function validateNoteFile(file: Pick<File, 'name' | 'size' | 'type' | 'arrayBuffer'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!Object.prototype.hasOwnProperty.call(NOTE_TYPES, extension)) throw new Error('Choose a PDF, JPEG, PNG, GIF, WebP, Word or PowerPoint file. Macro-enabled extensions are not supported.')
  const mime = NOTE_TYPES[extension]
  if (file.size < 1 || file.size > NOTE_FILE_LIMIT) throw new Error('Files must be non-empty and no larger than 20 MB.')
  if (file.type && file.type !== mime && file.type !== 'application/octet-stream') throw new Error('The file type does not match its extension.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length !== file.size) throw new Error('The file could not be read completely.')
  const starts = (...expected: number[]) => expected.every((n, i) => bytes[i] === n)
  const text = (from: number, to: number) => new TextDecoder().decode(bytes.subarray(from, to))
  let valid = false
  if (extension === 'pdf') valid = text(0, 5) === '%PDF-'
  if (extension === 'png') valid = starts(137,80,78,71,13,10,26,10)
  if (['jpg', 'jpeg'].includes(extension)) valid = starts(255,216,255)
  if (extension === 'gif') valid = ['GIF87a', 'GIF89a'].includes(text(0, 6))
  if (extension === 'webp') valid = text(0,4) === 'RIFF' && text(8,12) === 'WEBP'
  if (['doc', 'ppt'].includes(extension)) {
    const streams = new TextDecoder('utf-16le').decode(bytes)
    valid = starts(208,207,17,224,161,177,26,225) && streams.includes(extension === 'doc' ? 'WordDocument' : 'PowerPoint Document')
    if (/VBA|Macros|_VBA_PROJECT/i.test(streams)) throw new Error('Remove macros or export as PDF before uploading.')
  }
  if (['docx', 'pptx'].includes(extension)) valid = validOfficeZip(bytes, extension)
  if (!valid) throw new Error('The file contents do not match the selected format. Try exporting the original again.')
  return { extension, mime }
}

// Read the ZIP directory without decompressing attacker-controlled entries.
function validOfficeZip(bytes: Uint8Array, extension: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) return false
  const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true)
  if (count < 1 || count > 4096 || view.getUint16(end + 8, true) !== count || offset + view.getUint32(end + 12, true) !== end) return false
  let p = offset, total = 0
  const names = new Set<string>()
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || view.getUint32(p, true) !== 0x02014b50) return false
    if ((view.getUint16(p + 8, true) & 1) !== 0 || ![0, 8].includes(view.getUint16(p + 10, true))) return false
    const length = view.getUint16(p + 28, true), next = p + 46 + length + view.getUint16(p + 30, true) + view.getUint16(p + 32, true)
    if (next > end) return false
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + length))
    if (names.has(name) || name.includes('..') || name.startsWith('/') || name.includes('\\') || /vbaProject|macros/i.test(name)) return false
    names.add(name); total += view.getUint32(p + 24, true)
    if (total > 100 * 1024 * 1024) return false
    const local = view.getUint32(p + 42, true)
    if (local + 30 > offset || view.getUint32(local, true) !== 0x04034b50) return false
    const localNameLength = view.getUint16(local + 26, true), dataStart = local + 30 + localNameLength + view.getUint16(local + 28, true)
    if (dataStart + view.getUint32(p + 20, true) > offset || new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) return false
    p = next
  }
  return p === end && names.has('[Content_Types].xml') && names.has(extension === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml')
}
