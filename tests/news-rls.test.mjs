import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Actual migration and RLS evaluated by in-memory PostgreSQL. No network or live Supabase.
const db = new PGlite()
const sql = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const ids = { reader: '00000000-0000-4000-8000-000000000001', editor: '00000000-0000-4000-8000-000000000002', manager: '00000000-0000-4000-8000-000000000003', admin: '00000000-0000-4000-8000-000000000004' }
const image = '11111111-1111-4111-8111-111111111111.png'
const futureImage = '22222222-2222-4222-8222-222222222222.png'
async function as(role, run) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${role === 'visitor' ? 'anon' : 'authenticated'}`)
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [ids[role] ?? ''])
    return await run()
  } finally { await db.exec('rollback') }
}
async function setDay(day) {
  // Test owner only. Public callers cannot replace the function or supply a date to the RPC.
  await db.exec(`create or replace function public.class_today() returns date language sql stable set search_path = '' as $$ select '${day}'::date $$`)
}
test('Class News migration and access rules across all five roles', async t => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to anon, authenticated;
    revoke create on schema public from public;
  `)
  await db.exec(sql('../supabase/schema.sql'))
  await db.exec(sql('../supabase/accounts.sql'))
  await db.exec('grant select, insert, update, delete on all tables in schema public, storage to anon, authenticated')
  const migration = sql('../supabase/migrations/20261011_class_news.sql')
  await db.exec(migration)
  await db.exec(migration) // Idempotent rerun does not erase existing data/policies.
  await setDay('2026-10-11')
  for (const [role, id] of Object.entries(ids)) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${role}@synthetic.invalid`])
    await db.query('update public.profiles set role=$1, news_manager=$2 where id=$3', [role === 'admin' ? 'admin' : role === 'editor' ? 'editor' : 'reader', role === 'manager', id])
  }
  await db.query("insert into public.class_news(title,body,category,published_on,image_path) values('Published','Synthetic','announcement','2026-10-11',$1),('Scheduled','Synthetic','other','2026-10-12',$2)", [image, futureImage])
  await db.exec(`insert into storage.objects(bucket_id,name) values ('news-images','${image}'), ('news-images','${futureImage}')`)
  await db.exec(`insert into public.class_birthdays(display_name,birth_month,birth_day,consent_given,visible) values
    ('Synthetic A',10,11,true,true),('Synthetic B',10,11,true,true),('No consent',10,11,false,false),('Hidden',10,11,true,false),('Tomorrow',10,12,true,true),('Leap day',2,29,true,true)`)

  for (const role of ['visitor', 'reader', 'editor', 'manager', 'admin']) {
    const manager = ['manager', 'admin'].includes(role)
    await t.test(`${role}: published news, management, birthday roster and image access`, async () => {
      await as(role, async () => {
        assert.equal((await db.query('select public.can_manage_news() as allowed')).rows[0].allowed, manager)
        assert.equal((await db.query('select public.can_edit() as allowed')).rows[0].allowed, ['editor', 'admin'].includes(role))
        assert.equal((await db.query('select * from public.class_news')).rows.length, manager ? 2 : 1)
        assert.equal((await db.query("select name from storage.objects where bucket_id='news-images'")).rows.length, manager ? 2 : 1)
        const greetings = (await db.query('select * from public.today_birthday_greetings()')).rows
        assert.deepEqual(greetings.map(g => g.display_name), ['Synthetic A', 'Synthetic B'])
        assert.deepEqual(Object.keys(greetings[0]).sort(), ['display_name', 'greeting_date', 'greeting_key'])
      })
      if (role === 'visitor') {
        await assert.rejects(as(role, () => db.query('select * from public.class_birthdays')), /permission denied/)
      } else {
        await as(role, async () => assert.equal((await db.query('select * from public.class_birthdays')).rows.length, manager ? 6 : 0))
      }
      const newsWrite = () => as(role, () => db.query("insert into public.class_news(title,body,category) values('Synthetic attempt','Body','other')"))
      const birthdayWrite = () => as(role, () => db.query("insert into public.class_birthdays(display_name,birth_month,birth_day) values('Synthetic attempt',1,1)"))
      const imageWrite = () => as(role, () => db.query("insert into storage.objects(bucket_id,name) values('news-images','33333333-3333-4333-8333-333333333333.png')"))
      for (const write of [newsWrite, birthdayWrite, imageWrite]) {
        if (manager) await write()
        else await assert.rejects(write(), /permission denied|row-level security/)
      }
      if (role !== 'visitor') await as(role, async () => {
        assert.equal((await db.query("update public.class_news set pinned=true returning id")).rows.length, manager ? 2 : 0)
        assert.equal((await db.query("delete from public.class_news returning id")).rows.length, manager ? 2 : 0)
        assert.equal((await db.query("update public.class_birthdays set visible=false returning id")).rows.length, manager ? 6 : 0)
        assert.equal((await db.query("delete from public.class_birthdays returning id")).rows.length, manager ? 6 : 0)
        assert.equal((await db.query("delete from storage.objects where bucket_id='news-images' returning id")).rows.length, manager ? 2 : 0)
      })
    })
  }
  await t.test('only administrator can assign news_manager; managers cannot self-escalate', async () => {
    for (const role of ['reader', 'editor', 'manager', 'admin']) await as(role, async () => {
      assert.equal((await db.query('update public.profiles set news_manager=true where id=$1 returning id', [ids.editor])).rows.length, role === 'admin' ? 1 : 0)
      assert.equal((await db.query("update public.profiles set role='admin' where id=$1 returning id", [ids[role]])).rows.length, role === 'admin' ? 1 : 0)
    })
  })
  await t.test('news manager permission alone does not permit homework or Materials writes', async () => {
    await assert.rejects(as('manager', () => db.exec("insert into public.items(title,subject,due_date) values('Synthetic attempt','Math','2026-10-12')")), /row-level security/)
    await assert.rejects(as('manager', () => db.exec("insert into storage.objects(bucket_id,name) values('materials','not-permitted.pdf')")), /row-level security/)
  })
  await t.test('database validates consent, calendar days, duplicates and bucket settings', async () => {
    await assert.rejects(db.exec("insert into public.class_birthdays(display_name,birth_month,birth_day,visible) values('Bad consent',1,1,true)"), /check constraint/)
    await assert.rejects(db.exec("insert into public.class_birthdays(display_name,birth_month,birth_day) values('Bad day',2,30)"), /date field value out of range/)
    await assert.rejects(db.exec("insert into public.class_birthdays(display_name,birth_month,birth_day) values(' synthetic a ',10,11)"), /duplicate key/)
    const bucket = (await db.query("select * from storage.buckets where id='news-images'")).rows[0]
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 5242880)
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg','image/png','image/webp'])
    await assert.rejects(as('admin', () => db.query("insert into storage.objects(bucket_id,name) values('news-images','unsafe.svg')")), /row-level security/)
    await as('admin', async () => assert.equal((await db.query("update storage.objects set name='overwritten.png' where bucket_id='news-images' returning id")).rows.length, 0))
  })
  await t.test('RPC has no date parameter; tomorrow greeting disappears without history', async () => {
    await assert.rejects(as('reader', () => db.query("select * from public.today_birthday_greetings('2026-10-12'::date)")), /does not exist/)
    await assert.rejects(as('reader', () => db.exec("create or replace function public.class_today() returns date language sql as $$select '2026-10-12'::date$$")), /permission denied|must be owner/)
    await setDay('2026-10-12')
    await as('visitor', async () => assert.deepEqual((await db.query('select * from public.today_birthday_greetings()')).rows.map(g => g.display_name), ['Tomorrow']))
    await setDay('2027-02-28')
    assert.equal((await db.query('select * from public.today_birthday_greetings()')).rows.length, 0)
    await setDay('2028-02-29')
    assert.equal((await db.query('select * from public.today_birthday_greetings()')).rows[0].display_name, 'Leap day')
    assert.equal((await db.query('select count(*)::int as count from public.class_news')).rows[0].count, 2)
  })
  await db.close()
})
