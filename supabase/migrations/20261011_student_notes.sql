-- REVIEW ONLY. Requires schema.sql + accounts.sql. Does not require Class News.
-- Deploy upload-student-note separately: authenticated clients cannot upload
-- directly to this bucket, so server-side format validation cannot be bypassed.
begin;

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contributor text not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  subject text not null check (length(btrim(subject)) between 1 and 80),
  description text check (length(description) <= 2000),
  file_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  file_type text not null check (file_type in ('application/pdf','image/png','image/jpeg','image/gif','image/webp','application/msword','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  file_size bigint not null check (file_size between 1 and 20971520),
  created_at timestamptz not null default now()
);
create index if not exists student_notes_subject_date on public.student_notes(subject, created_at desc, id);
alter table public.student_notes enable row level security;
revoke all on public.student_notes from anon, authenticated;
grant select on public.student_notes to anon, authenticated;
grant insert, update, delete on public.student_notes to authenticated;
drop policy if exists "notes read" on public.student_notes;
create policy "notes read" on public.student_notes for select to anon, authenticated using (true);
drop policy if exists "notes insert own" on public.student_notes;
create policy "notes insert own" on public.student_notes for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "notes update own" on public.student_notes;
create policy "notes update own" on public.student_notes for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "notes remove own or admin" on public.student_notes;
create policy "notes remove own or admin" on public.student_notes for delete to authenticated using (owner_id = auth.uid() or public.my_role() = 'admin');

-- Prevent forged attribution, ownership transfer, backdating or referencing
-- another person's file. The private bucket accepts writes ONLY from the service.
create or replace function public.validate_student_note_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare object_metadata jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.owner_id <> old.owner_id or new.contributor <> old.contributor or new.created_at <> old.created_at then
      raise exception 'Note identity, contributor and upload date cannot be changed';
    end if;
  else
    new.created_at := now();
    select coalesce(nullif(left(btrim(p.name),80),''),'Student') into new.contributor from public.profiles p where p.id = new.owner_id;
  end if;
  new.title := btrim(new.title); new.subject := btrim(new.subject);
  if new.file_path !~ ('^' || new.owner_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|png|jpg|jpeg|gif|webp|doc|docx|ppt|pptx)$') then
    raise exception 'Invalid owned file path';
  end if;
  select metadata into object_metadata from storage.objects where bucket_id = 'student-notes' and name = new.file_path;
  if object_metadata is null or (object_metadata->>'size')::bigint is distinct from new.file_size or object_metadata->>'mimetype' is distinct from new.file_type then
    raise exception 'A server-validated upload matching this note is required';
  end if;
  return new;
end $$;
revoke all on function public.validate_student_note_row() from public, anon, authenticated;
drop trigger if exists validate_student_note_row on public.student_notes;
create trigger validate_student_note_row before insert or update on public.student_notes for each row execute function public.validate_student_note_row();

create table if not exists public.student_note_reports (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.student_notes(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('incorrect','missing','subject','inappropriate','other')),
  explanation text check (length(explanation) <= 2000),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (note_id, reporter_id)
);
create index if not exists note_reports_open on public.student_note_reports(note_id) where dismissed_at is null;
alter table public.student_note_reports enable row level security;
revoke all on public.student_note_reports from anon, authenticated;
grant insert (note_id, reporter_id, category, explanation) on public.student_note_reports to authenticated;
grant select on public.student_note_reports to authenticated;
grant update (dismissed_at) on public.student_note_reports to authenticated;
drop policy if exists "report own" on public.student_note_reports;
create policy "report own" on public.student_note_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "admin reads reports" on public.student_note_reports;
create policy "admin reads reports" on public.student_note_reports for select to authenticated using (public.my_role() = 'admin');
drop policy if exists "admin dismisses reports" on public.student_note_reports;
create policy "admin dismisses reports" on public.student_note_reports for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Public boolean only: no report counts, reasons, reporter identity or history.
create or replace function public.student_note_review_status()
returns table (note_id uuid) language sql stable security definer set search_path = '' as $$
  select distinct r.note_id from public.student_note_reports r where r.dismissed_at is null
$$;
revoke all on function public.student_note_review_status() from public;
grant execute on function public.student_note_review_status() to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('student-notes','student-notes',false,20971520,array['application/pdf','image/png','image/jpeg','image/gif','image/webp','application/msword','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;
do $$ begin
  if exists (select 1 from storage.buckets where id='student-notes' and
    (public is distinct from false or file_size_limit is distinct from 20971520 or allowed_mime_types is distinct from array['application/pdf','image/png','image/jpeg','image/gif','image/webp','application/msword','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation'])) then
    raise exception 'Existing student-notes bucket has incompatible settings. Review it before proceeding.';
  end if;
end $$;
drop policy if exists "notes files read" on storage.objects;
create policy "notes files read" on storage.objects for select to anon, authenticated using (
  bucket_id='student-notes' and (exists (select 1 from public.student_notes n where n.file_path=name)
    or split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin')
);
-- File deletion is allowed only AFTER removing/replacing its metadata. This
-- prevents users deleting a file still used by a live note, including their own.
drop policy if exists "notes files cleanup" on storage.objects;
create policy "notes files cleanup" on storage.objects for delete to authenticated using (
  bucket_id='student-notes' and (split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin')
  and not exists (select 1 from public.student_notes n where n.file_path=name)
);
-- No authenticated INSERT/UPDATE policy: upload-student-note is the only writer.
-- Restrictive guards also prevent unrelated broad legacy policies from granting
-- access to this new bucket. They do not change rules for other buckets.
drop policy if exists "notes forbid direct upload" on storage.objects;
create policy "notes forbid direct upload" on storage.objects as restrictive for insert to anon, authenticated with check (bucket_id <> 'student-notes');
drop policy if exists "notes forbid overwrite" on storage.objects;
create policy "notes forbid overwrite" on storage.objects as restrictive for update to anon, authenticated using (bucket_id <> 'student-notes') with check (bucket_id <> 'student-notes');
drop policy if exists "notes restrict deletion" on storage.objects;
create policy "notes restrict deletion" on storage.objects as restrictive for delete to anon, authenticated using (
  bucket_id <> 'student-notes' or ((split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin') and not exists (select 1 from public.student_notes n where n.file_path=name))
);
drop policy if exists "notes restrict file reads" on storage.objects;
create policy "notes restrict file reads" on storage.objects as restrictive for select to anon, authenticated using (
  bucket_id <> 'student-notes' or exists (select 1 from public.student_notes n where n.file_path=name) or split_part(name,'/',1)=auth.uid()::text or public.my_role()='admin'
);
-- Existing teacher Materials policies and files are deliberately unchanged.
notify pgrst, 'reload schema';
commit;
