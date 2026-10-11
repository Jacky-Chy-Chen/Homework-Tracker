import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const { NOTE_FILE_LIMIT, validateNote, validateNoteFile, validateReport, canEditNote, canRemoveNote } = await import('../src/lib/student-notes.ts')
const { demoStudentNotesStore, supabaseStudentNotesStore } = await import('../src/lib/student-notes-store.ts')
const pdf = () => new File([readFileSync(new URL('./synthetic-note.pdf', import.meta.url))], 'synthetic.pdf', { type: 'application/pdf' })

// Minimal directory fixtures: validation deliberately does not decompress content.
function officeZip(names) {
  const locals = [], entries = []; let offset = 0
  for (const name of names) {
    const n = Buffer.from(name), local = Buffer.alloc(30+n.length), central = Buffer.alloc(46+n.length)
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(n.length,26); n.copy(local,30)
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(n.length,28); central.writeUInt32LE(offset,42); n.copy(central,46)
    locals.push(local); entries.push(central); offset += local.length
  }
  const directory = Buffer.concat(entries), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length,8); end.writeUInt16LE(names.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16)
  return Buffer.concat([...locals,directory,end])
}
test('note fields, ownership and report categories', () => {
  validateNote({ title:'Summary', subject:'Math', description:null })
  for (const input of [{ title:'',subject:'Math',description:null }, { title:'a',subject:' ',description:null }, { title:'a',subject:'Math',description:'a'.repeat(2001) }]) assert.throws(() => validateNote(input))
  validateReport('incorrect',''); assert.throws(() => validateReport('__proto__','')); assert.throws(() => validateReport('other','a'.repeat(2001)))
  const note = { owner_id:'student' }
  assert.equal(canEditNote({ id:'student' },note),true)
  assert.equal(canEditNote({ id:'admin' },note),false)
  assert.equal(canRemoveNote({ id:'admin',role:'admin' },note),true)
  assert.equal(canRemoveNote({ id:'manager',role:'reader',news_manager:true },note),false)
  assert.equal(canRemoveNote(null,note),false)
})
test('files enforce size, extension, declared MIME and real signatures', async () => {
  assert.equal((await validateNoteFile(pdf())).mime,'application/pdf')
  const images = [ ['png','image/png',[137,80,78,71,13,10,26,10]], ['jpg','image/jpeg',[255,216,255]], ['gif','image/gif',Buffer.from('GIF89a')], ['webp','image/webp',Buffer.from('RIFFxxxxWEBP')] ]
  for (const [ext,type,bytes] of images) await validateNoteFile(new File([new Uint8Array(bytes)],`a.${ext}`,{ type }))
  for (const file of [new File(['<svg/>'],'a.svg',{ type:'image/svg+xml' }),new File(['<html/>'],'a.pdf',{ type:'application/pdf' }),new File(['%PDF-1.4'],'a.pdf',{ type:'text/html' }),new File([],'a.pdf',{ type:'application/pdf' }),new File(['%PDF-'],'a.pdf.exe',{ type:'application/pdf' })]) await assert.rejects(validateNoteFile(file))
  await assert.rejects(validateNoteFile({ ...pdf(), name:'a.pdf',type:'application/pdf',size:NOTE_FILE_LIMIT+1,arrayBuffer:() => { throw Error('Must not read oversized file') } }),/20 MB/)
  const atLimit = new Uint8Array(NOTE_FILE_LIMIT); atLimit.set(Buffer.from('%PDF-'))
  await validateNoteFile(new File([atLimit],'a.pdf',{ type:'application/pdf' }))
})
test('Office containers match document family and reject macros, traversal, duplicates and malformed ZIP', async () => {
  const docx = bytes => new File([bytes],'notes.docx',{ type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  await validateNoteFile(docx(officeZip(['[Content_Types].xml','word/document.xml'])))
  await validateNoteFile(new File([officeZip(['[Content_Types].xml','ppt/presentation.xml'])],'notes.pptx',{ type:'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
  for (const names of [['[Content_Types].xml','ppt/presentation.xml'], ['word/document.xml'], ['[Content_Types].xml','word/document.xml','word/vbaProject.bin'], ['[Content_Types].xml','word/document.xml','../unsafe'], ['[Content_Types].xml','word/document.xml','word/document.xml']]) await assert.rejects(validateNoteFile(docx(officeZip(names))))
  await assert.rejects(validateNoteFile(docx(Buffer.from('PK\x03\x04not a real directory'))))
  const ole = Buffer.concat([Buffer.from([208,207,17,224,161,177,26,225]),Buffer.from('WordDocument','utf16le')])
  await validateNoteFile(new File([ole],'notes.doc',{ type:'application/msword' }))
  await assert.rejects(validateNoteFile(new File([ole],'notes.ppt',{ type:'application/vnd.ms-powerpoint' })))
  await assert.rejects(validateNoteFile(new File([Buffer.concat([ole,Buffer.from('VBA','utf16le')])],'notes.doc',{ type:'application/msword' })),/macros/)
})
test('demo notes publish immediately; owners edit, admins moderate and reports stay private', async () => {
  const map = new Map(), storage = { getItem:k => map.get(k) ?? null,setItem:(k,v) => map.set(k,v) }
  let account = { id:'student',role:'reader',name:'Synthetic Student' }
  const store = demoStudentNotesStore(async () => account, storage)
  // FileReader adapter confined to tests; the browser exercises its real implementation.
  globalThis.FileReader = class { readAsDataURL(file) { file.arrayBuffer().then(b => { this.result=`data:${file.type};base64,${Buffer.from(b).toString('base64')}`; this.onload() }) } }
  const input = { title:'Synthetic notes',subject:'Math',description:null }
  await store.save(input,undefined,pdf())
  let note = (await store.list())[0]
  assert.equal(note.contributor,'Synthetic Student'); assert.equal(note.under_review,false)
  await store.save({ ...input,title:'Updated' },note)
  assert.equal((await store.list())[0].created_at,note.created_at)
  account = { id:'other',role:'reader' }
  await assert.rejects(store.save(input,note),/only your own/); await assert.rejects(store.remove(note),/cannot remove/)
  await store.report(note.id,'incorrect','Private explanation')
  assert.equal((await store.list())[0].under_review,true)
  await assert.rejects(store.report(note.id,'other',''),/already reported/)
  for (const role of ['reader','editor']) { account = { id:'manager',role,news_manager:true }; await assert.rejects(store.reports(),/Only administrators/) }
  account = null
  await assert.rejects(store.report(note.id,'other',''),/Sign in/); await assert.rejects(store.save(input,undefined,pdf()),/Sign in/)
  account = { id:'admin',role:'admin' }
  const reports = await store.reports(); assert.equal(reports.length,1)
  await store.dismiss(reports[0].id); assert.equal((await store.list())[0].under_review,false)
  account = { id:'other',role:'reader' }; await assert.rejects(store.report(note.id,'other',''),/already reported/)
  account = { id:'admin',role:'admin' }; await store.remove(note)
  assert.equal((await store.list()).length,0); assert.equal((await store.reports()).length,0)
})
test('Supabase adapter pages notes, handles private report duplicates and committed cleanup warnings', async () => {
  const note = { id:'a',owner_id:'student',file_path:'owned.pdf' }, calls=[]
  let error=null
  const chain = table => {
    const c = { data: table==='student_notes' ? [note] : [{ note_id:'a' }], error:null }
    for (const method of ['select','order','eq','is','update','delete','insert']) c[method]=(...args) => { calls.push([table,method,...args]); return c }
    c.range=(from,to) => { calls.push([table,'range',from,to]); return Promise.resolve({ data: from===0 ? c.data : [],error:null }) }
    c.single=() => Promise.resolve({ data:{ id:'a' },error })
    c.then=(resolve,reject) => Promise.resolve({ data:c.data,error }).then(resolve,reject)
    return c
  }
  const sb = { from:chain,rpc:chain,auth:{ getUser:async () => ({ data:{ user:{ id:'student' } },error:null }) },storage:{ from:() => ({ remove:async () => ({ error:{ message:'Cleanup failed' } }),createSignedUrl:async () => ({ data:{ signedUrl:'signed' },error:null }) }) } }
  const store = supabaseStudentNotesStore(sb)
  assert.equal((await store.list())[0].under_review,true)
  assert.equal(await store.remove(note),'Note removed, but its unused file needs administrator cleanup.')
  assert.ok(calls.some(c => c[1]==='eq' && c[2]==='file_path' && c[3]==='owned.pdf'))
  assert.equal(await store.fileUrl(note),'signed')
  error={ code:'23505',message:'Duplicate' }; await assert.rejects(store.report('a','other',''),/already reported/)
})
