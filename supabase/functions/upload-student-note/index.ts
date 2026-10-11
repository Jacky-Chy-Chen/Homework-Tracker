import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { validateNote, validateNoteFile, NOTE_FILE_LIMIT } from '../_shared/note-validation.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST to upload notes.' })
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'Sign in before uploading notes.' })
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const userClient = createClient(url, anon, { ...options, global: { headers: { Authorization: authorization } } })
  const admin = createClient(url, secret, options)
  // Verify with Auth; never trust a client-supplied owner ID or decoded JWT alone.
  const { data: { user }, error: authError } = await userClient.auth.getUser(authorization.slice(7))
  if (authError || !user) return reply(401, { error: 'Your session expired. Sign in again.' })
  let uploaded: string | null = null
  try {
    const length = Number(req.headers.get('Content-Length'))
    if (length > NOTE_FILE_LIMIT + 65536) return reply(413, { error: 'Files must be no larger than 20 MB.' })
    // Bound the request even when Content-Length is omitted or falsified.
    if (!req.body) return reply(400, { error: 'Choose a file.' })
    const reader = req.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > NOTE_FILE_LIMIT + 65536) { await reader.cancel(); return reply(413, { error: 'Files must be no larger than 20 MB.' }) }
      chunks.push(value)
    }
    const body = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
    const form = await new Request(req.url, { method: 'POST', headers: { 'Content-Type': req.headers.get('Content-Type') ?? '' }, body }).formData()
    const input = { title: String(form.get('title') ?? ''), subject: String(form.get('subject') ?? ''), description: String(form.get('description') ?? '').trim() || null }
    validateNote(input)
    const file = form.get('file'), id = String(form.get('id') ?? '')
    if (!(file instanceof File) || file.name.length > 255) return reply(400, { error: 'Choose a file with a filename under 256 characters.' })
    let oldPath: string | null = null
    if (id) {
      const { data, error } = await userClient.from('student_notes').select('owner_id,file_path').eq('id', id).single()
      if (error || data.owner_id !== user.id) return reply(403, { error: 'You can edit only your own notes.' })
      oldPath = data.file_path
    }
    const { extension, mime } = await validateNoteFile(file)
    uploaded = `${user.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await admin.storage.from('student-notes').upload(uploaded, file, { contentType: mime, upsert: false })
    if (uploadError) throw new Error('The upload could not be saved. Check storage setup and available space, then retry.')
    const row = { ...input, owner_id: user.id, file_path: uploaded, file_name: file.name, file_size: file.size, file_type: mime }
    const result = id
      ? await userClient.from('student_notes').update(row).eq('id', id).eq('file_path', oldPath!).select('id').single()
      : await userClient.from('student_notes').insert({ ...row, contributor: 'Student' }).select('id').single()
    if (result.error) throw new Error('The note could not be saved. Reload and retry; check that the migration is installed.')
    uploaded = null // Committed: never roll back this file on old-file cleanup failure.
    let warning: string | null = null
    if (oldPath) {
      const cleanup = await admin.storage.from('student-notes').remove([oldPath])
      if (cleanup.error) warning = 'Note saved, but its old file needs administrator cleanup.'
    }
    return reply(200, { id: result.data.id, warning })
  } catch (error) {
    let cleanupFailed = false
    if (uploaded) cleanupFailed = !!(await admin.storage.from('student-notes').remove([uploaded])).error
    return reply(400, { error: `${error instanceof Error ? error.message : 'The upload failed.'}${cleanupFailed ? ' An unused upload needs administrator cleanup.' : ''}` })
  }
})
