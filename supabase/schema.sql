-- Run once in Supabase → SQL Editor.

create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subject       text not null,
  type          text not null default 'daily' check (type in ('daily', 'project', 'test', 'other')),
  assigned_date date not null default current_date,
  due_date      date not null,
  notes         text,
  link          text,
  created_at    timestamptz not null default now()
);

create index if not exists items_due_date_idx on public.items (due_date);
create index if not exists items_assigned_date_idx on public.items (assigned_date);

alter table public.items enable row level security;

-- Anyone with the link can read.
drop policy if exists "public read" on public.items;
create policy "public read" on public.items
  for select using (true);

-- Only signed-in users can write. Turn OFF sign-ups (Authentication → Sign In / Providers
-- → "Allow new users to sign up") and create your own account under Authentication → Users,
-- so you are the only signed-in user.
drop policy if exists "poster write" on public.items;
create policy "poster write" on public.items
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Class timetable: one row holding the weekly grid, plus one-off changes.
-- ---------------------------------------------------------------------------

create table if not exists public.timetable (
  id    int primary key default 1,
  grid  jsonb not null,
  check (id = 1)
);

create table if not exists public.schedule_changes (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  period       int not null check (period between 1 and 9),
  subject      text,                 -- null = class cancelled
  swapped_with int,                  -- the other period, when this was a swap
  note         text,
  created_at   timestamptz not null default now(),
  unique (date, period)
);

create index if not exists schedule_changes_date_idx on public.schedule_changes (date);

-- ---------------------------------------------------------------------------
-- Materials: review sheets, notes and slides. Files live in Storage.
-- ---------------------------------------------------------------------------

create table if not exists public.materials (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  subject    text not null,
  notes      text,
  file_path  text not null,
  file_name  text not null,
  file_size  bigint not null default 0,
  file_type  text not null default '',
  item_id    uuid references public.items (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.timetable enable row level security;
alter table public.schedule_changes enable row level security;
alter table public.materials enable row level security;

-- Same rule everywhere: anyone may read, only signed-in posters may write.
do $$
declare t text;
begin
  foreach t in array array['timetable', 'schedule_changes', 'materials'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('drop policy if exists "poster write" on public.%I', t);
    execute format('create policy "poster write" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Storage: create a PUBLIC bucket named "materials" (Storage → New bucket),
-- then run these so only signed-in posters can upload or delete.
drop policy if exists "materials upload" on storage.objects;
create policy "materials upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'materials');

drop policy if exists "materials delete" on storage.objects;
create policy "materials delete" on storage.objects
  for delete to authenticated using (bucket_id = 'materials');
