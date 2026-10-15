# Phase 5 — Student Notes

Public-link access described below is historical, superseded by [the authentication deployment guide](AUTHENTICATION_DEPLOYMENT.md). Apply the 20261015 authentication migration last; notes/files require a session after that manual setup.

Implemented locally. No production migration, function deployment, data changes, commit, push or website deployment performed.

## Features and files

- `src/pages/Materials.tsx`: Teacher Materials / Student Notes sections. Existing teacher subject groups, uploads, homework links and files retained.
- `src/components/StudentNotes.tsx`: subject filter, progressively shown notes, inline upload/edit/report forms, private admin queue, removal confirmation, short-lived downloads, loading/error/retry/empty states.
- `src/lib/student-notes.ts`, `student-notes-store.ts`, `src/lib/store.ts`: types, ownership, paged Supabase reads and isolated browser-only demo. Reuses the existing auth client.
- `src/styles.css`: additive notes styles reuse existing tokens, typography, swatches, controls and row lists. No new production dependency or branding.
- `supabase/functions/_shared/note-validation.ts`: shared validation. `supabase/functions/upload-student-note/index.ts`: secure upload handler.
- `supabase/migrations/20261011_student_notes.sql`: review-only tables, attribution trigger, RLS/grants, review-status function and private bucket.
- `tests/student-notes.test.mjs`, `student-notes-rls.test.mjs`, `student-note-upload.test.mjs`, `note-edge-runtime.d.ts`, `synthetic-note.pdf`: tests and synthetic fixture, not private school information.

## Permissions and privacy

Anyone with the Classboard link can read notes, contributor display names and dates, matching the existing public-link resources. The UI explains this before uploading. Files use a private bucket and one-minute signed download URLs. Copied signed links work until expiry; downloaded copies cannot be revoked.

Any authenticated account publishes immediately, with no teacher approval. Owners alone edit; owners and admins remove. Editors/news managers have no moderation rights. Teacher Materials remain editor/admin-only under existing `accounts.sql` policies.

The database assigns the profile display-name snapshot (or “Student”) and original upload date, prevents ownership/attribution/date changes, and verifies the owned file against actual storage metadata. It never exposes profile emails. Edits preserve the original upload date.

Only admins read report rows. Reporters, note owners and other students cannot fetch reports. One report per account/note, even after dismissal. The public function returns only IDs with unresolved reports, not identities/reasons/counts. Reports never automatically delete notes. Dismissing the last report clears its badge; removing a note cascades reports.

Do not upload private school documents, personal information or work without sharing permission. The academic-calendar reference PDF remains ignored, untracked and outside build assets.

## File limits and security

Shared notes: PDF, JPEG/PNG/GIF/WebP, DOC/DOCX and PPT/PPTX, **20 MiB (20 × 1,024 × 1,024 bytes) per file**. Demo: 1,000,000 bytes per file, subject to browser capacity. ZIP/SVG/HTML/executables/macro-enabled extensions not accepted. Teacher formats/limits unchanged.

Browser validation repeats on the server. No authenticated account, including admin, can directly upload/overwrite notes objects; the server service client writes only after verifying the caller with Auth. The service-role key stays in Supabase's runtime, never frontend variables.

Checks cover extension, declared MIME, size, format signatures, legacy Office stream markers and modern Office ZIP directory structure. ZIP inspection is bounded, avoids decompression, rejects encryption/traversal/duplicate names/macro filenames, requires the matching document family and caps declared expansion at 100 MiB. These are **format checks, not a full document parser, sanitization or antivirus**. Valid documents can still contain malicious content; use trusted, updated software. No virus-scanning service is implemented.

The handler bounds request bytes even without trustworthy Content-Length, uses fresh owner/UUID paths, ignores client owner IDs, writes metadata under caller RLS, and detects concurrent replacement. Failed metadata saves clean up the new file. Committed replacements never roll back on old-file cleanup failure; they return a warning. Removal deletes metadata before its file; storage disallows deleting live referenced files or another owner's orphan. Cleanup warnings need admin attention. Interrupted uploads/account deletion may leave orphan files; no scheduled cleanup is installed.

The 20 MiB cap is **not total storage**. Notes, teacher resources and news images share the project's Supabase allowance. This work does not inspect billing/current usage, buy capacity or change project-wide limits. Check the Storage/Usage dashboard before bulk uploads, including any lower global upload cap. No per-account quota/rate limiter is installed; public signup abuse could exhaust storage and should be considered before deployment.

## Review-only setup

1. Review the full SQL in `supabase/migrations/20261011_student_notes.sql`. It requires existing schema/accounts structures/functions, not Phase 4. Do not rerun old schema scripts over production; their original policies predate roles.
2. Obtain explicit approval before applying it. It adds `student_notes`, `student_note_reports`, `validate_student_note_row()`, `student_note_review_status()`, policies/grants and `student-notes`. It does not alter accounts, teacher resources or news tables. Reruns preserve data. Incompatible existing bucket settings abort instead of silently changing visibility.
3. After separate authorization, deploy `upload-student-note` with its shared validation module through Supabase's Edge Function workflow. Keep platform JWT verification enabled (default). The handler also uses `auth.getUser()`. The runtime supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; never put the service secret in Vite or `.env.local`. No live function was deployed. See [Supabase's authenticated function guidance](https://supabase.com/docs/guides/functions/auth-legacy-jwt).
4. Review existing target-project storage policies. Restrictive guards prevent broader legacy policies bypassing this bucket's checks, without changing other buckets.
5. Test in an approved staging project: hosted function/runtime/import resolution, multipart authentication/CORS, real Storage metadata, replacement/deletion cleanup, signed downloads, all roles and real supported Office files. Test WeChat on a phone. Local policy tests/mocks do not prove hosted Storage or Deno behavior.

Without the migration, Student Notes shows a setup message and Teacher Materials remains usable. SQL without the upload function supports reads but uploads report a setup/retry error.

## Verification and limits

The full automated suite has **51 passing tests**: existing homework/calendar/news regressions; local PostgreSQL runs actual notes SQL/RLS across six account cases, including immediate own publication for all authenticated roles, ownership/admin removal, immutable attribution, server-file requirement, private duplicate reports, dismissal, teacher separation, restrictive policies, bucket settings and idempotence. Handler tests execute the real handler in Node with mocked Auth/Storage/database; test sessions/content/forged owners/request bounds/rollback/concurrent replacement/cleanup warnings. Pure/demo/adapter tests cover formats, 20 MiB boundary, ownership, reporting, paging and downloads.

Production build and a separate upload-function TypeScript check passed. No lint script is configured. Hosted Deno/Storage integration still needs approved staging. The pre-existing development-only `source-map-js` advisory noted in Phase 4 remains unchanged.

Browser-only demo verified synthetic PDF upload, immediate visibility, owner edit, download filename/expiry, reports, Under Review badge, admin queue/dismissal and duplicate rejection. Teacher resources stayed separate. Synthetic records are localhost:5200-only, never shared database data.

Desktop 1440 / phone 390 inspected in bounded passes, without horizontal document overflow. Captures displayed inline but could not be persisted using the supported capture workflow. Formal Impeccable saved-screenshot review remains pending; no visual-review pass claimed. Detector found only the existing guide width/height transition, unchanged. Long titles inherit the incumbent single-line ellipsis on phones; full title is accessible in the edit form to owners but remains a readability limitation for others pending final visual review.

Stop after Phase 5 for approval. Phase 6 is separate final integration/testing. No automatic migrations, commits, pushes or deployment.
