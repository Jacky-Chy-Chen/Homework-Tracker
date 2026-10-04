-- Accounts and permissions. Run once in Supabase → SQL Editor, after schema.sql.
--
-- Anyone may sign up with an email address, and every new account starts as a
-- reader: it can read the site, nothing more. An admin turns the few people who
-- post homework into editors. Writing is checked here, in the database, so a
-- reader cannot write even if they get past the buttons in the browser.
--
-- Before this works, in the Supabase dashboard:
--   Authentication → Sign In / Providers → Email
--     · "Allow new users to sign up"  → ON
--     · "Confirm email"               → OFF   (mail is unreliable in mainland China)
-- Afterwards, make yourself an admin with the statement at the bottom of this file.

create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text not null,
  name       text,
  role       text not null default 'reader' check (role in ('reader', 'editor', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A new sign-up gets a profile automatically, as a reader.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Asking "is this person an editor?" from inside a policy on profiles would read
-- profiles again, so these run as the owner and skip the recursion.
create or replace function public.my_role()
returns text
language sql
stable
security definer set search_path = public
as $$ select coalesce((select role from public.profiles where id = auth.uid()), 'reader') $$;

create or replace function public.can_edit()
returns boolean
language sql
stable
security definer set search_path = public
as $$ select public.my_role() in ('editor', 'admin') $$;

-- Everyone sees their own profile; an admin sees and changes everybody's.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.my_role() = 'admin');

drop policy if exists "admin writes roles" on public.profiles;
create policy "admin writes roles" on public.profiles
  for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- The site's own tables: anyone may read, only an editor or admin may write.
do $$
declare t text;
begin
  foreach t in array array['items', 'timetable', 'schedule_changes', 'materials'] loop
    execute format('drop policy if exists "poster write" on public.%I', t);
    execute format('drop policy if exists "editor write" on public.%I', t);
    execute format(
      'create policy "editor write" on public.%I for all to authenticated using (public.can_edit()) with check (public.can_edit())', t);
  end loop;
end $$;

-- Uploading and deleting files follows the same rule.
drop policy if exists "materials upload" on storage.objects;
create policy "materials upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'materials' and public.can_edit());

drop policy if exists "materials delete" on storage.objects;
create policy "materials delete" on storage.objects
  for delete to authenticated using (bucket_id = 'materials' and public.can_edit());

-- ---------------------------------------------------------------------------
-- Last step: make the first admin. Sign up on the site with your own email,
-- then run this once with that address:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Accounts that already existed before this file was run have no profile row,
-- so give them one as well:
--
--   insert into public.profiles (id, email, role)
--   select id, email, 'admin' from auth.users
--   on conflict (id) do nothing;
-- ---------------------------------------------------------------------------
