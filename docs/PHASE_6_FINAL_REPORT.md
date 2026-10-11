# Phase 6 — Final integration report

Date: 2026-10-11

## Outcome and boundaries

The local verification pass is complete: all 51 automated tests, the production build, and the separate upload-handler TypeScript check passed. This is **not a production-release approval**. The connected preview still reports missing Class News and Student Notes setup, so hosted uploads and authenticated end-to-end flows remain unverified.

This phase was diagnostic. No application fixes, production migrations, live records, account permissions, commits, pushes, or deployment were made. The browser was returned to Today and its temporary viewport override was reset. Earlier implementation changes in the working tree were preserved.

## Implemented scope

- Homework: today/next-school-day behavior, exact selected-day view, unlimited future assignment ordering, and paged homework retrieval.
- School calendar: separate from the homework calendar, with month navigation, categories, event details, and only the 11 approved G8 events. The approved winter holiday also affects school-day calculations.
- Class News: independent loading, archive, categories, pinning/scheduling, and separate news-manager permission. Birthday announcements use consent and UTC+8 date rules; the management roster is not included in the ordinary public feed.
- Student Notes: separate from existing teacher materials; own-note upload/edit, admin removal, private reports, public flag identifiers, private storage, signed downloads, and a server-side upload handler.

Implementation/setup references: [Class News](PHASE_4_CLASS_NEWS.md), [Student Notes](PHASE_5_STUDENT_NOTES.md), [Notes design](PHASE_5_DESIGN.md), and the [approved plan](CLASSBOARD_UPDATE_PLAN.md).

## Checks actually run

| Check | Result | Scope / limitation |
| --- | --- | --- |
| `npm test` | 51 passed, 0 failed | Homework, calendar, news, birthdays, notes, pagination, upload handler, and actual SQL policies in local PGlite PostgreSQL |
| `npm run build` | Passed | TypeScript + Vite, 104 modules; JS 488.95 KB / 138.69 KB gzip, CSS 32.47 KB / 6.76 KB gzip |
| Separate upload-handler TypeScript check | Passed | Strict check using the test runtime declarations; not a hosted Deno execution |
| `git diff --check` | Passed | Whitespace check, not a semantic review |
| Lint | Not run | No lint script configured; no new tool installed |
| Private calendar PDF | Ignored and untracked | `git check-ignore` and `git ls-files` checks; its filename was absent from `dist` |
| Frontend server-key marker | No matches in `dist` | Searched `SUPABASE_SERVICE_ROLE_KEY`; this is a targeted check, not an exhaustive secret audit |
| Technical UI detector | One verified legacy finding | Guided-tour animation transitions layout properties; no additional detector findings |

### Functional and permission coverage

Automated tests exercised visitor, ordinary student, homework editor, news manager, administrator, and different-note-owner cases. They execute the migration SQL locally rather than merely checking policy strings. This verifies the tested SQL behavior, not the deployed project's configuration.

- Homework: selected-day isolation, next-school-day rules, make-up/public holidays and winter break, future ordering, WeChat 14-day output rules, and collections exceeding one page.
- Calendar: month/year/leap navigation, date ranges, filters, and the approved event set.
- News: separate editor/manager permissions, scheduled/pinned posts, image validation, consent/withdrawal, birthday deduplication, UTC+8 day changes, and leap-day behavior.
- Notes: owner-only changes, attribution immutability, required stored object, private/unique reports, dismissal and deletion behavior, and restrictive storage guards against broad legacy policies. Combined news/notes policies and repeatable migrations were tested.
- Upload handler: the actual handler was executed in Node against fake Auth/Storage/database services. Tests cover authentication before upload, forged metadata/content, size bounds, rollback, replacement races, and cleanup. No hosted network requests were made by these handler tests.

### Browser coverage

The existing connected preview at `localhost:5199` was inspected as an unauthenticated visitor, using 390 × 844 and 1440 × 1000 viewport overrides. Dark theme was left unchanged.

- Today retained the homework-first layout; selecting the next day changed to the exact-day view and hid Coming Up.
- The school calendar stayed separate. November navigation, examination filtering, and midterm event selection worked.
- Classes and existing teacher materials remained accessible. No real files or records were changed.
- News and Notes displayed setup notices. Visitors did not see note-upload/report-management controls or birthday-management controls in the checked views.
- Direct navigation to People exposed an admin-style shell; see finding 4 below.
- No document-level horizontal overflow was measured on the inspected mobile pages or desktop Today. Inline screenshots were inspected for mobile School Calendar and desktop Today.

Logged-in browser workflows were not rerun against real accounts. Physical phones, WeChat's embedded browser, full keyboard/screen-reader operation, enlarged text, and all intermediate widths were not tested. Saved screenshot artifacts required for the earlier formal visual review remain unavailable; that review is not counted as passed.

## Technical interface audit

### Implementation integrity verdict

**Pass for source-system coherence; release gate not passed.** The implementation extends the existing tokens, navigation, cards, and role model; Today remains focused on homework, and teacher/student materials are distinct. The detector found only the existing guided-tour layout animation. This verdict is limited to inspected source and browser views, not a full visual or accessibility certification.

| Dimension | Score / 4 | Main finding |
| --- | --- | --- |
| Accessibility | 2 | Light-theme faint text falls below 4.5:1; reduced-motion handling is missing |
| Performance | 3 | Build is reasonable; guided-tour layout-property animation needs attention; no device profiling |
| Responsive design | 3 | Checked pages fit; small calendar targets and clipped note titles remain |
| Theming | 3 | Shared light/dark tokens; light faint token needs adjustment |
| Implementation integrity | 3 | Coherent features; legacy permission-shell and large-library gaps remain |
| **Total** | **14 / 20 — Good** | **Address weak dimensions before release** |

Seven findings: 0 P0, 1 P1, 6 P2, 0 P3. Missing hosted setup is a separate release prerequisite, not a scored UI defect.

### Prioritized findings

1. **[P1] Light-theme faint text contrast.** Location: `src/styles.css:14`, `--faint`. Category: Accessibility / Theming. Calculated contrast is 4.10:1 on white and 3.72:1 on the light background, below the 4.5:1 normal-text target associated with WCAG 1.4.3. Small copy/placeholders can be difficult to read. Dark faint text measured 5.01:1 on the dark surface. Adjust the light token and verify actual component backgrounds and disabled states. Suggested command: `/impeccable colorize`.

2. **[P2] Long note titles are clipped.** Location: `src/styles.css:837`, `.row-item-title`; `src/components/StudentNotes.tsx`, note heading. Category: Responsive Design. Inherited single-line ellipsis can hide identifying details, especially on phones; download accessible names are not a visible full-title view. Allow wrapping or provide an accessible full-title detail view. Suggested command: `/impeccable adapt`.

3. **[P2] Calendar touch targets are small.** Location: homework calendar controls and shared calendar styles in `src/styles.css`. Category: Responsive Design / Accessibility. Measured month buttons are 36 × 36 px and mobile day cells approximately 42 × 48 px, below the audit's recommended 44 × 44 target. They are harder to tap accurately. This alone does not establish a WCAG 2.5.8 failure, whose minimum is different. Increase hit areas without crowding the calendar. Suggested command: `/impeccable adapt`.

4. **[P2] People route exposes a misleading admin shell.** Location: `src/App.tsx`, People route; `src/pages/People.tsx:14`, component loading and TopBar. Category: Implementation Integrity. Hidden navigation does not guard direct URLs: a visitor can reach a management-looking page, although the tested database policies remain the authorization boundary. Reader-role copy also predates student-note uploads. Guard the page by admin role, avoid unauthorized account-list requests, and clarify role descriptions. No live account disclosure was established. Suggested command: `/impeccable harden`.

5. **[P2] Legacy profile errors can promote the UI role.** Location: `src/lib/store.ts:159`, `currentUser`; `setRole` in the same file. Category: Implementation Integrity. Any profile error mentioning “profiles” can trigger the legacy editor fallback, not just a missing table. Also, a role update does not verify a returned affected row. This can show inaccurate permissions or success; tested RLS still protects writes, so this is not a demonstrated database privilege escalation. Fail closed on profile errors and verify role-update results. Suggested command: `/impeccable harden`.

6. **[P2] Large teacher-material libraries are not paged.** Location: `src/lib/store.ts:134`, `materials()`. Category: Implementation Integrity. A single query can silently omit older files once the project's REST result-row cap is reached. The actual hosted cap was not inspected; this is not a storage-capacity measurement. Use the existing paging helper with stable ordering and test a multi-page library. Homework, news, and notes already have paging. Suggested command: `/impeccable harden`.

7. **[P2] Guided-tour motion lacks a reduced-motion alternative.** Location: `src/styles.css:994`, tour-hole transition. Category: Accessibility / Performance. Width/height/top/left transitions affect layout, and no `prefers-reduced-motion` handling was found. Provide an intentional non-moving/reduced-motion alternative preserving the current step and focus. The detector confirmed layout-property transitions; no frame-rate problem was measured. Suggested command: `/impeccable animate`.

### Patterns and positives

The remaining weaknesses mostly come from shared legacy behavior: the faint text token, compact calendar controls, admin-shell assumptions, and the single-query teacher library. Fix these centrally rather than adding one-off overrides.

Preserve the strong separation between homework editing and news management, independent feature failure states, private birthday/report data, server-side note validation, tested SQL authorization, stable pagination, and the established restrained interface. Semantic navigation and labeled controls were present in the inspected views; Today had no measured unlabeled empty buttons.

### Recommended interface actions

1. `/impeccable colorize`: repair light faint-text contrast.
2. `/impeccable harden`: permission/error-state accuracy and large teacher-library paging.
3. `/impeccable adapt`: mobile calendar hit areas and full note titles.
4. `/impeccable animate`: intentional reduced-motion tour behavior.
5. `/impeccable polish`: final consistency pass after functional fixes.

These can be requested one at a time, together, or in another order. Re-run `/impeccable audit` after fixes; this audit deliberately did not implement them.

## Setup and release checks still required

Review the SQL before authorizing application:

- `supabase/migrations/20261011_class_news.sql`: news, birthday data, news-management permission and image-storage policies; see Phase 4 setup instructions.
- `supabase/migrations/20261011_student_notes.sql`: notes/reports, private notes bucket, attribution and storage guards; see Phase 5 setup instructions.
- Deploy `supabase/functions/upload-student-note/index.ts` with the documented server-only configuration. Never place the service-role key in frontend variables.

Prefer an approved staging project first. Then test actual signed-in roles, uploads with representative supported files, signed downloads, edit/replacement/deletion cleanup, report privacy, news scheduling, birthday day-boundaries, and existing teacher materials. Check a physical phone and WeChat before production release. Obtain fresh saved desktop/mobile captures for formal visual review.

Student Notes accepts up to **20 MiB per file**; Class News images up to **5 MiB**. These are feature limits, not the total project storage allowance. The hosted plan allowance/current usage were not obtained in this phase. Teacher materials remain on their existing storage path; demo storage is browser-local and has its own much smaller file limit. Do not promise unlimited uploads based on the new note limit. There is no antivirus guarantee or per-student total-storage quota established by this audit.

The original school calendar PDF remains private and outside tracked/build output. Cleaning duty, polls, and other deferred interactive features remain out of scope. Nothing has been released to production by this phase.
