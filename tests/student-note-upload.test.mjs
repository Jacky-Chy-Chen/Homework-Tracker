import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

// Run the actual handler with an Auth/Storage/database adapter, not a live project.
registerHooks({
  resolve(specifier,ctx,next) { return specifier === 'npm:@supabase/supabase-js@2.116.0' ? { url:'test:note-supabase',shortCircuit:true } : next(specifier,ctx) },
  load(url,ctx,next) { return url === 'test:note-supabase' ? { format:'module',shortCircuit:true,source:'export const createClient = (...args) => globalThis.noteTestClientFactory(...args)' } : next(url,ctx) },
})
let handler, state
const owner='00000000-0000-4000-8000-000000000001'
globalThis.Deno={ env:{ get:name => ({ SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service' })[name] },serve:fn => { handler=fn } }
globalThis.noteTestClientFactory=(url,key,options) => {
  const service=key==='fake-service'
  assert.equal(url,'https://synthetic.invalid')
  if (service) assert.equal(options.global,undefined)
  return {
    auth:{ getUser:async token => { state.tokens.push(token); return { data:{ user:state.auth ? { id:owner } : null },error:state.auth ? null : { message:'Invalid' } } } },
    storage:{ from:bucket => {
      assert.equal(bucket,'student-notes')
      return {
        upload:async (path,file,opts) => { assert.equal(service,true); assert.equal(opts.upsert,false); state.uploads.push({ path,file,opts }); return { error:state.uploadError ? { message:'Full' } : null } },
        remove:async paths => { assert.equal(service,true); state.removes.push(paths); return { error:state.cleanupError ? { message:'Failed' } : null } },
      }
    } },
    from:table => {
      assert.equal(service,false); assert.equal(table,'student_notes')
      let operation='select', row, filters=[]
      const chain={
        select:() => chain,eq:(...args) => { filters.push(args); return chain },
        insert:r => { operation='insert'; row=r; return chain },update:r => { operation='update'; row=r; return chain },
        single:async () => {
          if (operation==='select') return { data:{ owner_id:state.oldOwner,file_path:'old-file.pdf' },error:state.missing ? { message:'Missing' } : null }
          state.writes.push({ operation,row,filters })
          return { data:{ id:'saved-id' },error:state.dbError ? { message:'Denied' } : null }
        },
      }
      return chain
    },
  }
}
await import('../supabase/functions/upload-student-note/index.ts')
const reset=() => { state={ auth:true,tokens:[],uploads:[],removes:[],writes:[],oldOwner:owner } }
const request=(file,id) => {
  const form=new FormData(); form.set('title','Synthetic notes'); form.set('subject','Math'); form.set('description','Synthetic only'); form.set('owner_id','forged-id'); if(id) form.set('id',id); form.set('file',file)
  return new Request('https://synthetic.invalid/upload',{ method:'POST',headers:{ Authorization:'Bearer synthetic-token' },body:form })
}
const pdf=() => new File([readFileSync(new URL('./synthetic-note.pdf',import.meta.url))],'synthetic.pdf',{ type:'application/pdf' })
test('secure upload verifies session before reading or uploading; CORS and method handling',async () => {
  reset()
  assert.equal((await handler(new Request('https://synthetic.invalid/upload',{ method:'OPTIONS' }))).status,200)
  assert.equal((await handler(new Request('https://synthetic.invalid/upload'))).status,405)
  assert.equal((await handler(new Request('https://synthetic.invalid/upload',{ method:'POST' }))).status,401)
  state.auth=false
  assert.equal((await handler(request(pdf()))).status,401)
  assert.deepEqual(state.tokens,['synthetic-token']); assert.equal(state.uploads.length,0)
})
test('secure upload rejects forged content and another owner; caller identity is authoritative',async () => {
  reset()
  assert.equal((await handler(request(new File(['<html/>'],'fake.pdf',{ type:'application/pdf' })))).status,400)
  assert.equal(state.uploads.length,0)
  state.oldOwner='someone-else'
  assert.equal((await handler(request(pdf(),'existing-id'))).status,403)
  assert.equal(state.uploads.length,0)
  state.oldOwner=owner
  const res=await handler(request(pdf())); assert.equal(res.status,200)
  assert.equal(state.writes[0].row.owner_id,owner); assert.equal(state.writes[0].row.contributor,'Student')
  assert.match(state.uploads[0].path,new RegExp(`^${owner}/[0-9a-f-]+\\.pdf$`))
  assert.equal(state.uploads[0].opts.contentType,'application/pdf')
})
test('secure upload rolls back uncommitted file and preserves committed replacement on cleanup failure',async () => {
  reset(); state.dbError=true
  assert.equal((await handler(request(pdf()))).status,400)
  assert.deepEqual(state.removes,[[state.uploads[0].path]])
  reset(); state.cleanupError=true
  const res=await handler(request(pdf(),'existing-id'))
  assert.equal(res.status,200); assert.match((await res.json()).warning,/old file needs/)
  assert.deepEqual(state.removes,[['old-file.pdf']])
  assert.ok(state.writes[0].filters.some(([key,value]) => key==='file_path' && value==='old-file.pdf'))
})
test('secure upload bounds oversized declared and streamed bodies',async () => {
  reset()
  const headers={ Authorization:'Bearer synthetic-token','Content-Type':'multipart/form-data; boundary=test','Content-Length':String(22*1024*1024) }
  assert.equal((await handler(new Request('https://synthetic.invalid/upload',{ method:'POST',headers,body:'test' }))).status,413)
  delete headers['Content-Length']
  assert.equal((await handler(new Request('https://synthetic.invalid/upload',{ method:'POST',headers,body:new Uint8Array(21*1024*1024) }))).status,413)
  assert.equal(state.uploads.length,0)
})
