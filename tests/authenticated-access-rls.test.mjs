import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = sql('../supabase/migrations/20261015_authenticated_class_access.sql')
const ids = { reader: '00000000-0000-4000-8000-000000000001', editor: '00000000-0000-4000-8000-000000000002', manager: '00000000-0000-4000-8000-000000000003', admin: '00000000-0000-4000-8000-000000000004' }
const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const notePath = `${ids.reader}/11111111-1111-4111-8111-111111111111.pdf`
const image = '22222222-2222-4222-8222-222222222222.png'
const futureImage = '33333333-3333-4333-8333-333333333333.png'
const tables = ['items','timetable','schedule_changes','materials','profiles','class_news','class_birthdays','student_notes','student_note_reports']
const db = new PGlite()
async function as(role, run) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${role === 'visitor' ? 'anon' : 'authenticated'}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [ids[role] ?? ''])
    return await run()
  } finally { await db.exec('rollback') }
}
const rejected = fn => assert.rejects(fn, /permission denied|row-level security/)
async function records() {
  const result = {}
  for (const table of tables) result[table] = (await db.query(`select * from public.${table} order by id`)).rows
  result.objects = (await db.query('select * from storage.objects order by id')).rows
  result.accounts = (await db.query('select * from auth.users order by id')).rows
  return result
}

test('latest authentication migration: all class data and files require a session', async t => {
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      alter table storage.buckets enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;
      revoke create on schema public from public;
      create policy "legacy broad storage" on storage.objects for all to anon,authenticated using(true) with check(true);
      create policy "legacy bucket visibility" on storage.buckets for select to anon,authenticated using(true);`)
    await db.exec(sql('../supabase/schema.sql'))
    await db.exec(sql('../supabase/accounts.sql'))
    await db.exec('grant select,insert,update,delete on all tables in schema public,storage to anon,authenticated')
    await db.exec(sql('../supabase/migrations/20261011_class_news.sql'))
    await db.exec(sql('../supabase/migrations/20261011_student_notes.sql'))
    await db.exec(`create or replace function public.class_today() returns date language sql stable set search_path='' as $$select '2026-10-15'::date$$;
      insert into storage.buckets(id,name,public) values('materials','materials',true),('unrelated','unrelated',true);`)
    for (const [role,id] of Object.entries(ids)) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${role}@synthetic.invalid`])
      await db.query('update public.profiles set role=$1,news_manager=$2 where id=$3', [role === 'admin' ? 'admin' : role === 'editor' ? 'editor' : 'reader', role === 'manager', id])
    }
    await db.exec(`insert into public.items(title,subject,due_date) values('Synthetic homework','Math','2026-10-16');
      insert into public.timetable(grid) values('[["Math"]]');
      insert into public.schedule_changes(date,period,subject) values('2026-10-16',1,'Math');
      insert into public.materials(title,subject,file_path,file_name) values('Synthetic material','Math','existing.pdf','existing.pdf');
      insert into storage.objects(bucket_id,name) values('materials','existing.pdf'),('materials','orphan.pdf'),('news-images','${image}'),('news-images','${futureImage}'),('unrelated','public.txt');
      insert into public.class_news(title,body,category,published_on,image_path) values('Published','Body','announcement','2026-10-15','${image}'),('Scheduled','Body','other','2026-10-16','${futureImage}');
      insert into public.class_birthdays(display_name,birth_month,birth_day,consent_given,visible) values('Synthetic birthday',10,15,true,true);`)
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('student-notes',$1,$2)", [notePath, { size: 100, mimetype: 'application/pdf' }])
    await db.query("insert into public.student_notes(id,owner_id,contributor,title,subject,file_path,file_name,file_type,file_size) values($1,$2,'Ignored','Synthetic notes','Math',$3,'notes.pdf','application/pdf',100)", [noteId, ids.reader, notePath])
    await db.query("insert into public.student_note_reports(note_id,reporter_id,category) values($1,$2,'incorrect')", [noteId,ids.editor])
    const before = await records()
    await db.exec(migration)
    await db.exec(migration)
    assert.deepEqual(await records(), before, 'reruns preserve homework, accounts, profiles, metadata and stored objects')

    await t.test('anonymous class tables and sensitive RPCs are denied', async () => {
      for (const table of tables) await rejected(() => as('visitor', () => db.query(`select * from public.${table}`)))
      for (const fn of ['today_birthday_greetings','student_note_review_status','my_role','can_edit','can_manage_news','class_today']) {
        await rejected(() => as('visitor', () => db.query(`select * from public.${fn}()`)))
      }
    })
    await t.test('legacy broad policies cannot expose files or private bucket metadata', async () => {
      await as('visitor', async () => {
        assert.equal((await db.query("select * from storage.objects where bucket_id in ('materials','news-images','student-notes')")).rows.length,0)
        assert.equal((await db.query("select * from storage.buckets where id in ('materials','news-images','student-notes')")).rows.length,0)
        assert.equal((await db.query("select * from storage.objects where bucket_id='unrelated'")).rows.length,1)
      })
      const buckets = (await db.query('select id,public from storage.buckets order by id')).rows
      for (const bucket of buckets) assert.equal(bucket.public, bucket.id === 'unrelated')
    })
    for (const role of ['reader','editor','manager','admin']) await t.test(`${role}: authenticated reads and existing role restrictions`, async () => {
      const editor = ['editor','admin'].includes(role), manager = ['manager','admin'].includes(role)
      await as(role, async () => {
        for (const table of ['items','timetable','schedule_changes','materials','student_notes']) assert.equal((await db.query(`select * from public.${table}`)).rows.length,1)
        assert.equal((await db.query('select * from public.class_news')).rows.length,manager ? 2 : 1)
        assert.equal((await db.query('select * from public.class_birthdays')).rows.length,manager ? 1 : 0)
        assert.equal((await db.query('select * from public.profiles')).rows.length,role === 'admin' ? 4 : 1)
        assert.equal((await db.query('select * from public.student_note_reports')).rows.length,role === 'admin' ? 1 : 0)
        assert.equal((await db.query('select * from public.today_birthday_greetings()')).rows[0].display_name,'Synthetic birthday')
        assert.deepEqual((await db.query('select * from public.student_note_review_status()')).rows,[{ note_id: noteId }])
        assert.equal((await db.query("select * from storage.objects where bucket_id='materials'")).rows.length,editor ? 2 : 1)
        assert.equal((await db.query("select * from storage.objects where bucket_id='news-images'")).rows.length,manager ? 2 : 1)
        assert.equal((await db.query("select * from storage.objects where bucket_id='student-notes'")).rows.length,1)
        assert.equal((await db.query("update public.items set title='Changed' returning id")).rows.length,editor ? 1 : 0)
        assert.equal((await db.query("update public.timetable set grid='[]' returning id")).rows.length,editor ? 1 : 0)
        assert.equal((await db.query("delete from public.schedule_changes returning id")).rows.length,editor ? 1 : 0)
        assert.equal((await db.query("update public.profiles set role='admin' where id=$1 returning id",[ids.editor])).rows.length,role === 'admin' ? 1 : 0)
        assert.equal((await db.query("update public.student_notes set title='Changed' returning id")).rows.length,role === 'reader' ? 1 : 0)
      })
      const homeworkInsert = () => as(role, () => db.exec("insert into public.items(title,subject,due_date) values('Attempt','Math','2026-10-17')"))
      const newsInsert = () => as(role, () => db.exec("insert into public.class_news(title,body,category) values('Attempt','Body','other')"))
      const materialUpload = () => as(role, () => db.exec("insert into storage.objects(bucket_id,name) values('materials','attempt.pdf')"))
      if (editor) { await homeworkInsert(); await materialUpload() } else { await rejected(homeworkInsert); await rejected(materialUpload) }
      if (manager) await newsInsert(); else await rejected(newsInsert)
      await rejected(() => as(role, () => db.exec("insert into storage.objects(bucket_id,name) values('student-notes','direct-upload.pdf')")))
      await as(role, async () => {
        assert.equal((await db.query("delete from storage.objects where bucket_id='materials' returning id")).rows.length,editor ? 2 : 0)
        assert.equal((await db.query("delete from storage.objects where bucket_id='news-images' returning id")).rows.length,manager ? 2 : 0)
        assert.equal((await db.query("update storage.objects set name='overwrite' where bucket_id='materials' returning id")).rows.length,0)
        assert.equal((await db.query('delete from public.student_notes returning id')).rows.length,['reader','admin'].includes(role) ? 1 : 0)
      })
    })
    await t.test('signup metadata cannot grant roles or news management', async () => {
      const id = '00000000-0000-4000-8000-000000000099'
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id,'new@synthetic.invalid',{ name:'New reader',role:'admin',news_manager:true }])
      const row = (await db.query('select role,news_manager from public.profiles where id=$1',[id])).rows[0]
      assert.deepEqual(row,{ role:'reader',news_manager:false })
    })
    await t.test('session guard survives an accidental later anonymous SELECT grant', async () => {
      await db.exec('grant select on public.items to anon')
      await as('visitor', async () => assert.equal((await db.query('select * from public.items')).rows.length,0))
      await as('no-user', async () => assert.equal((await db.query('select * from public.items')).rows.length,0))
      await as('no-user', async () => {
        assert.equal((await db.query('select * from public.today_birthday_greetings()')).rows.length,0)
        assert.equal((await db.query('select * from public.student_note_review_status()')).rows.length,0)
      })
    })
  } finally { await db.close() }
})

test('authentication migration aborts when prerequisites are missing', async () => {
  const empty = new PGlite()
  try {
    await assert.rejects(empty.exec(migration), /Missing public.profiles/)
    await empty.exec('rollback')
    assert.equal((await empty.query("select to_regclass('public.items') as relation")).rows[0].relation,null)
  } finally { await empty.close() }
})
