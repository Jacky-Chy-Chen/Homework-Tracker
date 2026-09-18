# Homework Tracker

A homeroom homework board. One poster adds each day's homework plus long-term projects
and tests; everyone else opens the link from the WeChat group to see today's homework and a
calendar of what's coming up. The Today page also writes the daily group-chat message,
with automatic reminders for projects/tests due in the next 14 days.

## Pages

| Route | Who | What |
|---|---|---|
| `#/` | everyone | Today's homework by subject, "coming up" list, ‹ › to browse days. Poster also gets the **Copy** group-chat message. |
| `#/calendar` | everyone | Month view of everything by due date. Tap a day for details. "Projects & tests only" hides daily homework. |
| `#/post` | poster | Sign in, add / edit / delete items. |

## Run locally

```bash
npm install
npm run dev
```

With no `.env.local`, the app runs in **demo mode**: sample data, saved only in that browser.

## Connect Supabase (shared data)

1. Create a Supabase project.
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
4. Authentication → Users → **Add user** with your email + password (this is the poster account).
5. `cp .env.example .env.local` and fill in the URL and anon key from Project Settings → API.

Anyone can read; only signed-in users can write, and sign-ups are off, so that's only you.

## Deploy

`npm run build` produces a static site in `dist/` (relative paths, hash routing), so it works on
any static host. In mainland China, `*.vercel.app` and `*.pages.dev` are often unreachable in
WeChat — pick a host classmates can actually open, then pin the link in the group.

## Code map

- `src/lib/store.ts` — data layer: Supabase, or localStorage in demo mode
- `src/lib/homework.ts` — "coming up" rules and the group-chat message text
- `src/lib/dates.ts` — local `YYYY-MM-DD` date helpers
- `src/pages/` — Today, Calendar, Post (sign-in lives in Post)
- `src/components/` — shared UI (cards, timeline, month grid, icons)
- `src/styles.css` — the "Terminal Night" theme; colors are CSS variables at the top

Fonts (Geist, Geist Mono) are bundled via `@fontsource` rather than Google Fonts, which is blocked in mainland China.
