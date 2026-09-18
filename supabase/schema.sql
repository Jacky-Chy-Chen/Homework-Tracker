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
