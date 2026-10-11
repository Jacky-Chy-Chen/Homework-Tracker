# Phase 4 — Class News implementation and migration review

## What is implemented

- Today has a compact Class News section below homework, with three recent/pinned posts, dates, categories, previews, optional images, and View All.
- `#/news` is the archive. It has all four categories, complete post text, pagination in the view, and deep links to individual posts. Future-dated posts stay hidden until publication. Automatic birthday greetings are never archived.
- Authorized managers can add, edit, pin, schedule and remove posts, and manage birthday consent/visibility. Removal requires an explicit confirmation in the interface.
- Administrators can assign the independent `news_manager` flag on People. Homework editors do not inherit it. No teacher account/email was invented or granted permissions.
- Birthdays store display name, month, day, consent and visibility only. No birth year. Multiple greetings can appear; duplicate records are prevented by normalized name/month/day (use distinct display names for namesakes).
- The school clock is Asia/Shanghai (UTC+8), matching the school's location. The birthday RPC has no date parameter and returns only today's consented greetings, not the roster or original record IDs. February 29 is greeted only in leap years.
- The app checks the school date every 30 seconds, reloads after midnight and on focus/visibility, and rejects yesterday's cached greetings. Managers' saves refresh the current view.

## SQL for review — NOT applied

Review the full SQL in [`20261011_class_news.sql`](../supabase/migrations/20261011_class_news.sql).

Prerequisites: existing `schema.sql` and `accounts.sql` already applied. Do not rerun those older files on a configured production database; older setup policies can change existing authorization.

This migration adds:

1. `profiles.news_manager`, false by default. Existing profile update RLS restricts assignments to admins.
2. `class_news`, with constraints, publication date and RLS: public reads of published posts; management only for admins/news managers.
3. `class_birthdays`, with valid-date/consent checks and RLS restricted to managers. Ordinary authenticated users see zero roster rows; visitors have no table privileges.
4. `can_manage_news()` and the UTC+8 school-day function.
5. A narrowly scoped, fixed-search-path `today_birthday_greetings()` function. Its intentionally public result contains only display name, a daily greeting key and the current date. Callers cannot request another birthday date.
6. A **private** `news-images` bucket, max 5 MiB per image, JPEG/PNG/WebP only. Published images use short-lived signed links (10 minutes); future/unattached images are readable only by managers. Upload/delete policies require news-management permission, and overwrites are not allowed. An existing incompatible bucket causes the transaction to stop, rather than silently exposing files.

All statements run transactionally and can be rerun. Existing accounts, homework, timetable, Materials, and school-calendar source data are not replaced. The app needs no service-role key.

After explicit approval, an administrator can apply this SQL in Supabase SQL Editor. **No production migration, bucket creation, account permission changes, commit, push or deployment has been performed.** Until setup is applied, Class News shows a setup message and homework remains usable.

## Configuration after approval

- Assign `news_manager` through People to an identified authorized account; do not make the teacher an administrator merely to manage news.
- Before enabling a birthday, obtain the student's permission for their display name/greeting to be readable by **anyone with the site link**, not merely signed-in classmates.
- Birthday visibility and consent both default off. Withdrawing either hides the greeting. Do not add real birthday records to demo mode.
- News images/text are announcements for site visitors. Obtain permission for student photos and manual birthday-related posts separately.
- The image limit is per file, not additional purchased storage: files use the existing Supabase project's available storage quota.

## Verification and limits

- `npm test` uses Node.js 24+ and an in-memory PostgreSQL engine (PGlite, development dependency only). It applies the actual migration to local synthetic schemas and tests visitor, reader, editor, news manager and administrator access: publication visibility, news CRUD, birthday CRUD, image access, permission assignment and escalation attempts, consent, duplicate constraints, date-restricted RPC and leap days. It never connects to Supabase.
- Pure-helper/demo tests cover sorting, preview limits, school midnight, multiple greetings, stale/duplicate greetings, forms and image MIME/header/size checks. Existing homework/message/calendar/pagination regression tests remain included.
- Browser testing uses a separate demo preview at port 5200 with clearly labeled synthetic records. No real student data or production writes are used.
- `npm run build` checks TypeScript and static production compilation. There is no configured lint command.
- Final results: 31 automated tests passed; TypeScript/production build passed; `git diff --check` passed. The original academic PDF remains Git-ignored and absent from build assets.
- Browser checks covered demo publishing/editing, scheduling, archive category filters, birthday consent gating/withdrawal, greeting exclusion from the archive, persistent demo permission assignment, and the connected preview's isolated setup state. Desktop and 390px mobile layouts were inspected; the mobile news form had no horizontal overflow. The temporary demo server was stopped after testing.
- The design detector reported only the pre-existing guide animation of width/height; no new news-interface findings. The feature reuses existing typography, surfaces, accent tokens, controls and navigation. A formal saved-screenshot design review remains pending: screenshots were inspected in the browser, but no review-image files were saved in this session. Do not describe that separate review as passed.
- Local PostgreSQL tests exercise real RLS SQL but emulate Supabase auth/Storage schemas. Actual hosted Storage upload/download and signed-link behavior still require staging testing after migration approval; no claim of production verification is made.
- MIME/size restrictions are enforced by Storage; client checks additionally reject mismatching raster headers. There is no antivirus/transcoding service. Signed image links can remain usable for up to 10 minutes after access changes. Viewers can copy any greeting they are permitted to see; consent cannot retract screenshots.
- A database setup error is isolated to Class News and does not block homework. Network/load errors are retryable, not silently treated as empty news.
- The existing build-tool dependency `source-map-js` 1.2.1 is flagged by `npm audit` for GHSA-68fv-2mgg-jv7q (high, indexed source-map denial of service). It was present before Phase 4. No unrelated automatic dependency upgrade was performed.

## Deferred

No collaborative birthday cards, cakes, shared wishes, animations, polls, cleaning-duty schedules or student-note feature was added. Phase 5 and production setup/deployment require separate approval.
