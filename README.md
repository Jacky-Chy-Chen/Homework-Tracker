# Classboard

A homeroom homework board for G8 (5). One editor (the class rep or the teacher) adds each day's homework plus long-term projects
and tests; everyone else opens the link from the WeChat group to see today's homework and a
calendar of what's coming up. The Today page also writes the daily group-chat message,
with automatic reminders for projects/tests due in the next 14 days.

## Pages

| Route | Who | What |
|---|---|---|
| `#/` | everyone | One day at a time: what is due (on today, the next school day's hand-ins), the month calendar, and (for editors) the **Copy** group-chat message. `#/?d=2026-10-08` opens a particular date. |
| `#/schedule` | everyone | The weekly timetable with bell times. An editor can swap two classes — on the same day or across days — or cancel one, for a single date or for good. |
| `#/materials` | everyone | Review sheets, notes and slides. Editors upload; everyone downloads. |
| `#/post` | everyone | Sign in or sign up. Editors get the form to add / edit / delete items. |
| `#/people` | admins | Every account, and what each one may do. |

## Accounts

Anyone may sign up with an email address. A new account is a **reader**: it can read the site and
nothing else. An **admin** raises the few people who post to **editor** on the `#/people` page;
an **admin** can also hand out permissions. The rule is enforced in the database, not just in the
browser, so a reader cannot write even by other means.

Setting it up once, in Supabase:

1. SQL Editor → run `supabase/schema.sql`, then `supabase/accounts.sql`.
2. Authentication → Sign In / Providers → Email: turn **Allow new users to sign up** on and
   **Confirm email** off (confirmation mail is unreliable in mainland China).
3. Sign up on the site with your own address, then in SQL Editor:
   `update public.profiles set role = 'admin' where email = 'you@example.com';`

Accounts that existed before step 1 have no profile row yet; the bottom of `accounts.sql` has the
statement that gives them one.

## Run locally

```bash
npm install
npm run dev
```

With no `.env.local`, the app runs in **demo mode**: sample data, saved only in that browser.
Uploaded files are kept as data URLs there, so demo mode caps them at 1 MB.

## How the rules work

- **The calendar** only shows projects, tests and homework due later than the next school day.
  Everyday homework stays on the Today page and in the chat message.
- **A star** marks any day with a test; a lime dot marks projects.
- **The timetable** is a weekly grid (`src/lib/schedule.ts` holds the printed one) plus
  per-date changes, so a one-off swap never affects the following week. Changes for the next
  school day are added to the group message automatically.
- **Ticked-off homework** is saved per student, in their own browser only.

## Connect Supabase (shared data)

1. Create a Supabase project.
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Storage → New bucket → name it `materials` and tick **Public bucket**.
4. Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
5. Authentication → Users → **Add user** with your email + password (this is your editor account).
6. `cp .env.example .env.local` and fill in the URL and anon key from Project Settings → API.

Anyone can read; only signed-in users can write, and sign-ups are off, so that's only you.

## Deploy

`npm run build` produces a static site in `dist/` (relative paths, hash routing), so it works on
any static host. In mainland China, `*.vercel.app` and `*.pages.dev` are often unreachable in
WeChat — pick a host classmates can actually open, then pin the link in the group.

## Code map

- `src/lib/store.ts` — data layer: Supabase, or localStorage in demo mode
- `src/lib/homework.ts` — "coming up" rules and the group-chat message text
- `src/lib/dates.ts` — local `YYYY-MM-DD` date helpers
- `src/lib/schedule.ts` — bell times, the printed timetable, and how changes are applied
- `src/lib/holidays.ts` — the State Council's holiday and make-up days; update it each autumn
- `src/pages/` — Today (includes the calendar), Schedule, Materials, Post (sign-in and sign-up live in Post), People
- `src/components/Tour.tsx` — the guided tour that dims the page and lights one part at a time
- `src/components/` — shared UI (cards, timeline, month grid, icons)
- `src/styles.css` — the theme; every colour is a CSS variable at the top, light and dark

The font (Plus Jakarta Sans) is bundled via `@fontsource` rather than Google Fonts, which is blocked in mainland China.
