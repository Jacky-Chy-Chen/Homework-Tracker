-- REVIEW / MANUAL APPLICATION ONLY. Never run automatically from the frontend.
-- Requires schema.sql, accounts.sql, 20261011_class_news.sql and
-- 20261011_student_notes.sql, in that order. Run this LAST, also on fresh installs.
-- Changes authorization and bucket privacy only. Does not delete/move files,
-- backfill/overwrite profiles, change existing roles, or alter class records.
begin;

-- A missing prerequisite aborts the transaction instead of partially securing it.
do $$
declare t text;
begin
  foreach t in array array['profiles','items','timetable','schedule_changes','materials',
    'class_news','class_birthdays','student_notes','student_note_reports'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Missing public.%: apply the documented prerequisite schema/migrations first', t;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    -- Restrictive AND guard also defeats old permissive anonymous policies.
    execute format('drop policy if exists "class requires session" on public.%I', t);
    execute format('create policy "class requires session" on public.%I as restrictive for all to anon, authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)', t);
  end loop;

  foreach t in array array['items','timetable','schedule_changes','materials'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "class authenticated read" on public.%I', t);
    execute format('create policy "class authenticated read" on public.%I for select to authenticated using ((select auth.uid()) is not null)', t);
    execute format('grant select on public.%I to authenticated', t);
    -- Preserve editor/admin writes even if an old broad policy is still present.
    execute format('drop policy if exists "class editor insert guard" on public.%I', t);
    execute format('create policy "class editor insert guard" on public.%I as restrictive for insert to authenticated with check (public.can_edit())', t);
    execute format('drop policy if exists "class editor update guard" on public.%I', t);
    execute format('create policy "class editor update guard" on public.%I as restrictive for update to authenticated using (public.can_edit()) with check (public.can_edit())', t);
    execute format('drop policy if exists "class editor delete guard" on public.%I', t);
    execute format('create policy "class editor delete guard" on public.%I as restrictive for delete to authenticated using (public.can_edit())', t);
  end loop;
end $$;

-- Registration remains open in Auth settings (manual dashboard setting).
-- Explicitly ignore any role/news_manager supplied in signup metadata.
alter table public.profiles alter column role set default 'reader';
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,name,role,news_manager)
  values(new.id, new.email, nullif(new.raw_user_meta_data ->> 'name',''), 'reader', false)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Keep roster access manager-only; ordinary authenticated users see only today's
-- consented greetings, not full birthday records or future/past greetings.
drop policy if exists "news read published" on public.class_news;
create policy "news read published" on public.class_news for select to authenticated
  using (published_on <= public.class_today() or public.can_manage_news());
drop policy if exists "notes read" on public.student_notes;
create policy "notes read" on public.student_notes for select to authenticated using (auth.uid() is not null);

create or replace function public.today_birthday_greetings()
returns table(greeting_key text, display_name text, greeting_date date)
language sql stable security definer set search_path = '' as $$
  select md5(b.id::text || ':' || public.class_today()::text), b.display_name, public.class_today()
  from public.class_birthdays b
  where auth.uid() is not null and b.consent_given and b.visible
    and b.birth_month = extract(month from public.class_today())
    and b.birth_day = extract(day from public.class_today())
  order by b.display_name, b.id
$$;
create or replace function public.student_note_review_status()
returns table(note_id uuid) language sql stable security definer set search_path = '' as $$
  select distinct r.note_id from public.student_note_reports r
  where auth.uid() is not null and r.dismissed_at is null
$$;
revoke all on function public.today_birthday_greetings(), public.student_note_review_status(),
  public.my_role(), public.can_edit(), public.can_manage_news(), public.class_today() from public, anon;
grant execute on function public.today_birthday_greetings(), public.student_note_review_status(),
  public.my_role(), public.can_edit(), public.can_manage_news(), public.class_today() to authenticated;

-- Crucial: public file delivery bypasses object RLS. Make existing buckets
-- private in place; object names, IDs, metadata and bytes are unchanged.
update storage.buckets set public = false where id in ('materials','news-images','student-notes');

drop policy if exists "class buckets require session" on storage.buckets;
create policy "class buckets require session" on storage.buckets as restrictive for select to anon, authenticated
  using (id not in ('materials','news-images','student-notes') or (select auth.uid()) is not null);

drop policy if exists "class files require session" on storage.objects;
create policy "class files require session" on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id not in ('materials','news-images','student-notes') or (select auth.uid()) is not null)
  with check (bucket_id not in ('materials','news-images','student-notes') or (select auth.uid()) is not null);

drop policy if exists "materials authenticated read" on storage.objects;
create policy "materials authenticated read" on storage.objects for select to authenticated
  using (bucket_id='materials' and (public.can_edit() or exists(select 1 from public.materials m where m.file_path=name)));
drop policy if exists "news images read published" on storage.objects;
create policy "news images read published" on storage.objects for select to authenticated
  using (bucket_id='news-images' and (public.can_manage_news() or exists(
    select 1 from public.class_news n where n.image_path=name and n.published_on<=public.class_today())));
drop policy if exists "notes files read" on storage.objects;
create policy "notes files read" on storage.objects for select to authenticated
  using (bucket_id='student-notes' and (exists(select 1 from public.student_notes n where n.file_path=name)
    or split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin'));
-- These older restrictive policies reference protected tables. Keep them out
-- of anon's query plan so unrelated buckets remain usable without table grants.
alter policy "notes restrict file reads" on storage.objects to authenticated;
alter policy "notes restrict deletion" on storage.objects to authenticated;

-- Defense against unrelated, broad Storage policies: they must not expose
-- scheduled images/orphans or grant readers teacher-material upload/delete.
drop policy if exists "class files read guard" on storage.objects;
create policy "class files read guard" on storage.objects as restrictive for select to authenticated
  using (bucket_id not in ('materials','news-images','student-notes') or (auth.uid() is not null and (
    (bucket_id='materials' and (public.can_edit() or exists(select 1 from public.materials m where m.file_path=name)))
    or (bucket_id='news-images' and (public.can_manage_news() or exists(select 1 from public.class_news n where n.image_path=name and n.published_on<=public.class_today())))
    or (bucket_id='student-notes' and (exists(select 1 from public.student_notes n where n.file_path=name) or split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin'))
  )));
drop policy if exists "class files insert guard" on storage.objects;
create policy "class files insert guard" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('materials','news-images','student-notes') or (auth.uid() is not null and (
    (bucket_id='materials' and public.can_edit())
    or (bucket_id='news-images' and public.can_manage_news() and name ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$')
  )));
-- None of the class buckets supports overwriting. Replacement uses a new path.
drop policy if exists "class files update guard" on storage.objects;
create policy "class files update guard" on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('materials','news-images','student-notes'))
  with check (bucket_id not in ('materials','news-images','student-notes'));
drop policy if exists "class files delete guard" on storage.objects;
create policy "class files delete guard" on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('materials','news-images','student-notes') or (auth.uid() is not null and (
    (bucket_id='materials' and public.can_edit())
    or (bucket_id='news-images' and public.can_manage_news())
    or (bucket_id='student-notes' and (split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin')
      and not exists(select 1 from public.student_notes n where n.file_path=name))
  )));

notify pgrst, 'reload schema';
commit;
