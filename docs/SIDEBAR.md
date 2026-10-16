# Unified collapsible sidebar

Implemented 2026-10-16. This is a navigation/role-display change only. Authentication logic, role permissions, Supabase migrations, RLS and stored class data are unchanged.

## Layout contract

| Width | Default | Expanded behavior | Content offset |
| --- | --- | --- | --- |
| Below 768px | Hidden; top-left menu button in the page header | 220px modal overlay with backdrop | 0px |
| 768–1023px | 60px icon rail | 220px modal overlay with backdrop | Always 60px |
| 1024px and above | 220px expanded | Toggle between 220px and 60px; never an overlay | Matches sidebar width |

There is one navigation list, not separate desktop/mobile copies. Every primary link and secondary row is 44px high, with 4px between links and a fixed 44px icon column. The icon centers stay 30px from the viewport's left edge while the sidebar is visible. Labels keep their column and are hidden/clipped in rail mode; links are never rearranged for a breakpoint. The primary navigation remains near the top. Guide, Theme, Account information and Sign out follow near the bottom with automatic top spacing. The sidebar scrolls as one column on short screens, keeping every control reachable.

The phone menu lives in the normal page-header flow rather than floating above headings. Bottom-navigation markup, styles and reserved bottom spacing are removed. Existing desktop content grids and application styles are retained.

## Preferences and resizing

The browser stores `expanded` or `collapsed` under `classboard-sidebar-desktop` and `classboard-sidebar-tablet`. Defaults are used only when a valid preference is absent. Storage errors never prevent navigation. Phone open state is not persisted; phones start closed on mounting or entering the phone category. Resizing within a category does not rearrange links or close an open phone menu. Desktop choices are not overwritten by tablet or phone changes. Closing a tablet overlay saves its collapsed state.

Width, content-offset and backdrop transitions last 180ms. This short, targeted layout transition is intentional: the requested desktop sidebar must push content smoothly. It is not an unbounded decorative animation. All new transitions are removed under `prefers-reduced-motion: reduce`; closing/hiding and state feedback still work immediately.

## Overlay accessibility

- Open overlays use a named modal dialog and an accessible close/collapse control. The rest of the application is marked `inert` and `aria-hidden`; the backdrop can close the overlay without entering the tab order.
- Opening scrolls the drawer to its top and focuses its first control. Tab/Shift+Tab stay inside. Focus attempts on background controls are redirected into the drawer.
- Body scrolling is locked with preserved styles, scrollbar compensation and scroll coordinates, including fixed-body locking for mobile. Closing, resizing out of overlay mode and unmounting restore those values.
- Escape, backdrop clicks, menu-item selection and hash changes close overlays. Focus returns to the phone menu or tablet toggle after the DOM/route update. Resizing a focused desktop sidebar to a hidden phone sidebar also moves focus to the phone menu.
- Collapsed icons have accessible action labels and hover/focus tooltips. Links expose `aria-current="page"`. The Account row presents the current identity and role; it does not add an account-management endpoint.
- Guide selection closes the overlay before displaying the tour. The tour ignores inert/hidden targets; on phones its final help target is the menu button, which leads to Guide. A saved tablet overlay cannot trap the tour.

## Correct role display

`RoleBadge` maps the profile role directly: `admin → Admin`, `editor → Editor`, `reader → Reader`. It is used in the sidebar account area and every page header. `canEdit()` remains only an authorization/UI-access helper, not a badge-label decision. Admins no longer appear as Editors in narrow headers. Existing filtered navigation and route guards remain in place; Readers do not receive Add or People links, and Editors do not receive People.

## Files

- `src/components/Sidebar.tsx`: shared navigation shell, preferences, overlay state and tooltips.
- `src/lib/sidebar.ts`: breakpoint/state/preference rules and layout contract.
- `src/lib/sidebar-overlay.ts`: DOM focus and body-scroll effects with cleanup.
- `src/components/SidebarContext.ts`: phone-menu connection to existing page headers.
- `src/components/RoleBadge.tsx`: profile-role display, independent of editing capability.
- `src/App.tsx`, `src/components/ui.tsx` and page `TopBar` calls: replace the old shell and pass actual profile data; the authentication boundary is untouched.
- `src/components/Icon.tsx`, `src/components/Tour.tsx`, `src/styles.css`: matching menu/sign-out icons, hidden-target compatibility and responsive navigation styles.

## Verification and limits

Automated tests simulate **320, 375, 768, 1024 and 1440px** widths. They verify default states, content offsets, stable link order/row heights/icon columns, separate persisted preferences, phone reset behavior, active links, tooltips, keyboard focus trapping/return, backdrop/selection/Escape/toggle closing, guide handoff, body-scroll cleanup and both themes. Full-App tests check navigation filtering and exact Reader/Editor/Admin labels at every requested width; existing authentication tests still verify that signed-out users see only Sign In / Sign Up. The sidebar's text/active/badge/tooltip color pairs are checked against the 4.5:1 normal-text contrast target in both themes.

The DOM tests use jsdom and React, not the user's browser, desktop or screenshots. They do not prove real pixel geometry, physical touch behavior, rendering, animation frame rate or complete screen-reader compatibility. Manual visual checks in real browsers/WeChat, at the five widths and on short/landscape screens, remain advisable. No screen-viewing tools or screenshots were used. The development-only jsdom dependency is not part of the production bundle.

Run `npm test` with Node 24+ and `npm run build`. No new Supabase setup is required for this sidebar change. The earlier authentication migration remains a separate manual rollout if not already completed. Existing dependency advisories are outside this navigation change; no broad dependency autofix was run.

Final local results: **101 tests passed**, TypeScript/production build passed, and whitespace checks passed. The interface detector flags the intentionally requested short width/content-offset transitions and the existing guided-tour layout transition; no visual-review or real-device pass is claimed.
