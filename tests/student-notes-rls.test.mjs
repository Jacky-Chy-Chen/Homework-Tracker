import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const ids = { student: '00000000-0000-4000-8000-000000000001', other: '00000000-0000-4000-8000-000000000002', editor: '00000000-0000-4000-8000-000000000003', manager: '00000000-0000-4000-8000-000000000004', admin: '00000000-0000-4000-8000-000000000005' }
const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const file = `${ids.student}/11111111-1111-4111-8111-111111111111.pdf`
const db = new PGlite()
async function as(role, fn) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${role === 'visitor' ? 'anon' : 'authenticated'}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids[role] ?? ''])
    return await fn()
  } finally { await db.exec('rollback') }
}
test('student note migration: ownership, reports, files and teacher separation', async t => {
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    revoke create on schema public from public;`)
  await db.exec(sql('../supabase/schema.sql'))
  await db.exec(sql('../supabase/accounts.sql'))
  await db.exec('grant select,insert,update,delete on all tables in schema public,storage to anon,authenticated')
  await db.exec(sql('../supabase/migrations/20261011_class_news.sql'))
  const migration = sql('../supabase/migrations/20261011_student_notes.sql')
  await db.exec(migration)
  await db.exec(migration)
  for (const [role,id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id,`${role}@synthetic.invalid`,{ name: role === 'student' ? 'Synthetic Student' : role }])
    await db.query('update public.profiles set role=$1,news_manager=$2 where id=$3', [role === 'admin' ? 'admin' : role === 'editor' ? 'editor' : 'reader',role === 'manager',id])
  }
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('student-notes',$1,$2)",[file,{ size: 100, mimetype: 'application/pdf' }])
  const insertNote = (owner = ids.student, path = file) => db.query("insert into public.student_notes(id,owner_id,contributor,title,subject,file_path,file_name,file_type,file_size) values($1,$2,'Forged attribution','Synthetic notes','Math',$3,'notes.pdf','application/pdf',100) returning *",[noteId,owner,path])
  await as('student',async () => {
    const n = (await insertNote()).rows[0]
    assert.equal(n.contributor,'Synthetic Student')
  })
  await insertNote()
  for (const role of ['visitor','student','other','editor','manager','admin']) await t.test(`${role}: note reads, owner edits, admin removal and file rules`,async () => {
    await as(role,async () => {
      assert.equal((await db.query('select * from public.student_notes')).rows.length,1)
      assert.equal((await db.query("select * from storage.objects where bucket_id='student-notes'")).rows.length,1)
      if (role !== 'visitor') {
        assert.equal((await db.query("update public.student_notes set title='Changed' returning id")).rows.length,role === 'student' ? 1 : 0)
        // Live files cannot be deleted, even by their owner or admin.
        assert.equal((await db.query("delete from storage.objects where bucket_id='student-notes' returning id")).rows.length,0)
        const removed = (await db.query('delete from public.student_notes returning id')).rows.length
        assert.equal(removed,['student','admin'].includes(role) ? 1 : 0)
        assert.equal((await db.query("delete from storage.objects where bucket_id='student-notes' returning id")).rows.length,['student','admin'].includes(role) ? 1 : 0)
      }
    })
    await assert.rejects(as(role,() => db.query("insert into storage.objects(bucket_id,name,metadata) values('student-notes',$1,'{}')",[`${ids.student}/22222222-2222-4222-8222-222222222222.pdf`])), /permission denied|row-level security/)
    if (role !== 'visitor') await as(role,async () => assert.equal((await db.query("update storage.objects set name='overwrite' where bucket_id='student-notes' returning id")).rows.length,0))
  })
  await t.test('forged owners, paths, immutable attribution, size and missing files rejected',async () => {
    for (const [set,args] of [
      ['owner_id=$1',[ids.other]], ['contributor=$1',['Forged']], ['created_at=$1',['2000-01-01']],
      ['file_size=$1',[101]], ['file_path=$1',[`${ids.other}/11111111-1111-4111-8111-111111111111.pdf`]],
      ['file_path=$1',[`${ids.student}/33333333-3333-4333-8333-333333333333.pdf`]],
    ]) await assert.rejects(as('student',() => db.query(`update public.student_notes set ${set} where id='${noteId}'`,args)),/cannot be changed|owned file path|server-validated|row-level security/)
    await assert.rejects(as('other',() => db.query("insert into public.student_notes(owner_id,contributor,title,subject,file_path,file_name,file_type,file_size) values($1,'Forged','Attempt','Math',$2,'a.pdf','application/pdf',100)",[ids.student,file])),/row-level security|duplicate key/)
  })
  await t.test('every authenticated role can publish its own server-validated note immediately',async () => {
    for (const role of ['student','other','editor','manager','admin']) await as(role,async () => {
      // Test fixture storage is created by the database owner, just as the service uploads it.
      await db.exec('set local role postgres')
      const path = `${ids[role]}/55555555-5555-4555-8555-555555555555.pdf`
      await db.query("insert into storage.objects(bucket_id,name,metadata) values('student-notes',$1,$2)",[path,{ size:100,mimetype:'application/pdf' }])
      await db.exec('set local role authenticated')
      const row = (await db.query("insert into public.student_notes(owner_id,contributor,title,subject,file_path,file_name,file_type,file_size) values($1,'Ignored','Immediately visible','Math',$2,'notes.pdf','application/pdf',100) returning *",[ids[role],path])).rows[0]
      assert.equal(row.owner_id,ids[role]); assert.equal((await db.query('select id from public.student_notes where id=$1',[row.id])).rows.length,1)
    })
  })
  const report = (reporter = ids.other) => db.query("insert into public.student_note_reports(note_id,reporter_id,category,explanation) values($1,$2,'incorrect','Private synthetic explanation')",[noteId,reporter])
  await t.test('reports are private; duplicate/forged reports fail; flags disclose IDs only',async () => {
    await assert.rejects(as('visitor',() => report()),/permission denied/)
    await assert.rejects(as('other',() => report(ids.student)),/row-level security/)
    await as('other',report)
    await report()
    for (const role of ['student','other','editor','manager','admin']) await as(role,async () => {
      assert.equal((await db.query('select * from public.student_note_reports')).rows.length,role === 'admin' ? 1 : 0)
      assert.equal((await db.query('update public.student_note_reports set dismissed_at=now() returning id')).rows.length,role === 'admin' ? 1 : 0)
    })
    for (const role of ['visitor','student','other','editor','manager','admin']) await as(role,async () => {
      const flags = (await db.query('select * from public.student_note_review_status()')).rows
      assert.deepEqual(flags,[{ note_id: noteId }])
    })
    await assert.rejects(as('other',report),/duplicate key/)
    await assert.rejects(as('admin',() => db.query("update public.student_note_reports set reporter_id=$1",[ids.admin])),/permission denied/)
    await assert.rejects(as('other',() => db.query("insert into public.student_note_reports(note_id,reporter_id,category,dismissed_at) values($1,$2,'other',now())",[noteId,ids.other])),/permission denied/)
    await db.exec('update public.student_note_reports set dismissed_at=now()')
    assert.equal((await db.query('select * from public.student_note_review_status()')).rows.length,0)
    await assert.rejects(as('other',report),/duplicate key/)
    await db.exec('update public.student_note_reports set dismissed_at=null')
    await as('admin',async () => { await db.exec('delete from public.student_notes'); assert.equal((await db.query('select * from public.student_note_reports')).rows.length,0) })
  })
  await t.test('teacher write permissions unchanged; broad storage policies cannot bypass note guards',async () => {
    for (const role of ['student','other','manager']) {
      await assert.rejects(as(role,() => db.exec("insert into public.materials(title,subject,file_path,file_name) values('Attempt','Math','a.pdf','a.pdf')")),/row-level security/)
      await assert.rejects(as(role,() => db.exec("insert into storage.objects(bucket_id,name) values('materials','a.pdf')")),/row-level security/)
    }
    for (const role of ['editor','admin']) await as(role,() => db.exec("insert into public.materials(title,subject,file_path,file_name) values('Allowed','Math','a.pdf','a.pdf')"))
    await db.exec('create policy "synthetic broad policy" on storage.objects for all to anon,authenticated using(true) with check(true)')
    await assert.rejects(as('student',() => db.exec("insert into storage.objects(bucket_id,name) values('student-notes','bypass.pdf')")),/row-level security/)
    await as('other',async () => { assert.equal((await db.query("update storage.objects set name='overwrite' where bucket_id='student-notes' returning id")).rows.length,0); assert.equal((await db.query("delete from storage.objects where bucket_id='student-notes' returning id")).rows.length,0) })
    const orphan = `${ids.other}/44444444-4444-4444-8444-444444444444.pdf`
    await db.query("insert into storage.objects(bucket_id,name) values('student-notes',$1)",[orphan])
    await as('visitor',async () => assert.equal((await db.query('select * from storage.objects where name=$1',[orphan])).rows.length,0))
    const bucket = (await db.query("select * from storage.buckets where id='student-notes'")).rows[0]
    assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),20*1024*1024)
  })
  await db.exec(migration)
  assert.equal((await db.query('select count(*)::int as count from public.student_notes')).rows[0].count,1)
  await db.close()
})
