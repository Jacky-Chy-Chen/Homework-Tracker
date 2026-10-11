-- Phase 4, REVIEW ONLY. Requires schema.sql and accounts.sql. Do not apply without approval.
-- Non-destructive: existing accounts, homework and Materials are preserved.
begin;

alter table public.profiles add column if not exists news_manager boolean not null default false;

create or replace function public.can_manage_news()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = auth.uid() and (role = 'admin' or news_manager)) $$;
revoke all on function public.can_manage_news() from public;
grant execute on function public.can_manage_news() to anon, authenticated;

create or replace function public.class_today()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Shanghai')::date $$;
revoke all on function public.class_today() from public;
grant execute on function public.class_today() to anon, authenticated;

create table if not exists public.class_news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 10000),
  category text not null check (category in ('announcement', 'achievement', 'birthday', 'other')),
  published_on date not null default public.class_today(),
  pinned boolean not null default false,
  image_path text check (image_path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  created_at timestamptz not null default now()
);
create index if not exists class_news_date_idx on public.class_news (published_on desc, id);
alter table public.class_news enable row level security;
revoke all on public.class_news from anon, authenticated;
grant select on public.class_news to anon;
grant select, insert, update, delete on public.class_news to authenticated;
drop policy if exists "news read published" on public.class_news;
create policy "news read published" on public.class_news for select to anon, authenticated
  using (published_on <= public.class_today() or public.can_manage_news());
drop policy if exists "news managers write" on public.class_news;
create policy "news managers write" on public.class_news for all to authenticated
  using (public.can_manage_news()) with check (public.can_manage_news());

create table if not exists public.class_birthdays (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_day smallint not null check (birth_day between 1 and 31),
  consent_given boolean not null default false,
  visible boolean not null default false,
  check (not visible or consent_given),
  check (extract(month from make_date(2000, birth_month, birth_day)) = birth_month)
);
-- Prevent accidental duplicate entries. Use distinct display names for namesakes.
create unique index if not exists class_birthdays_person_idx
  on public.class_birthdays (lower(btrim(display_name)), birth_month, birth_day);
alter table public.class_birthdays enable row level security;
revoke all on public.class_birthdays from anon, authenticated;
grant select, insert, update, delete on public.class_birthdays to authenticated;
drop policy if exists "birthday managers only" on public.class_birthdays;
create policy "birthday managers only" on public.class_birthdays for all to authenticated
  using (public.can_manage_news()) with check (public.can_manage_news());

-- No date argument: callers cannot enumerate birthdays on other days.
-- Definer intentionally exposes only consented, visible greetings for TODAY.
-- No birth year, complete birth date, roster ID or stored news-history entry.
create or replace function public.today_birthday_greetings()
returns table(greeting_key text, display_name text, greeting_date date)
language sql stable security definer set search_path = ''
as $$
  select md5(b.id::text || ':' || public.class_today()::text), b.display_name, public.class_today()
  from public.class_birthdays b
  where b.consent_given and b.visible
    and b.birth_month = extract(month from public.class_today())
    and b.birth_day = extract(day from public.class_today())
  order by b.display_name, b.id
$$;
revoke all on function public.today_birthday_greetings() from public;
grant execute on function public.today_birthday_greetings() to anon, authenticated;

-- Private raster-only bucket. Images for future news are not publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- Refuse an incompatible pre-existing bucket rather than silently expose images.
do $$ begin
  if exists (select 1 from storage.buckets where id = 'news-images' and
    (public is distinct from false or file_size_limit is distinct from 5242880
      or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp'])) then
    raise exception 'news-images already exists with incompatible settings; review its privacy and limits before applying this migration';
  end if;
end $$;
drop policy if exists "news images read published" on storage.objects;
create policy "news images read published" on storage.objects for select to anon, authenticated
  using (bucket_id = 'news-images' and (
    public.can_manage_news() or exists (
      select 1 from public.class_news n where n.image_path = name and n.published_on <= public.class_today()
    )
  ));
drop policy if exists "news images manager upload" on storage.objects;
create policy "news images manager upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'news-images' and public.can_manage_news()
    and name ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$');
drop policy if exists "news images manager delete" on storage.objects;
create policy "news images manager delete" on storage.objects for delete to authenticated
  using (bucket_id = 'news-images' and public.can_manage_news());
-- No overwrite/update policy; replacement images use a fresh UUID.
notify pgrst, 'reload schema';
commit;
