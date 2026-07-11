# UNIT-6.8 — Dedicated settings view (prefix, card display, projects)

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 8).

## What changed

A full-screen, Linear-style **Settings** view with a left sub-nav, reached from a gear button in the sidebar (`#settings` route). It houses everything board-level that used to be scattered in header popovers.

- **`packages/sync/src/board-doc.ts`** — `setTicketPrefix(doc, prefix, now)` writes `meta.shortIdPrefix`.
- **`packages/commands/src/commands/board.ts`** — `setTicketPrefix` command (normalizes with `normalizeTicketPrefix` → uppercase, ≤5, empty allowed), registered in the catalog + index (agent parity).
- **`apps/web/lib/use-board.ts`** — `useTicketPrefix` / `useSetTicketPrefix` hooks.
- **`apps/web/lib/use-boards.ts`** — `useSettingsRoute()` (reactive `#settings` hash + setter). Settings is a distinct route from an open ticket.
- **`apps/web/components/settings/`** (new):
  - `settings-view.tsx` — the shell: back-to-board header, left nav (General / Card display / Projects), and the active section pane.
  - `general-settings.tsx` — the ticket-prefix input (live-normalized, `maxLength=5`, empty allowed, helper text, and a live `#42` / `TEC-42` preview).
  - `project-settings.tsx` — create / rename (inline) / recolor (swatch popover from `LABEL_COLORS`) / archive projects.
  - Card display reuses the existing `BadgeConfig` component in a section.
- **`apps/web/components/app/workspace-app.tsx`** — added the sidebar **gear** button (opens settings); renders `SettingsView` in place of the board when the route is active; **removed the header "Badges" popover** (card-display config now lives in Settings).

## Why

- Product decision (user, R9): a real settings surface, learning from Linear's settings UI, instead of ad-hoc header popovers.
- **Routed, not modal**: settings is a distinct place with multiple sections, so `#settings` (reusing the Unit 6.3 hash router) and a full main-area replacement fit better than a dialog. It also makes the view linkable/back-button friendly.
- **Ticket prefix normalized in the command** (not just the input) so any caller — UI, MCP, REST — gets the same uppercase/≤5 guarantee. Because the id is a stored integer and the prefix is display-only (Unit 6.1), the prefix is freely editable: changing it only re-labels tickets. **This is the point where the plan's dropped "confirm — cannot change later" constraint would live; per the revised design it is intentionally editable, with no lock.**
- **Reuse `BadgeConfig`** rather than duplicating it — the card-display config is the same behavior, just relocated.

## How it works

The sidebar gear sets `#settings`; `Shell` swaps `MainArea` for `SettingsView`. The view keeps a local `section` state and renders `GeneralSettings`, `BadgeConfig`, or `ProjectSettings`. The prefix input normalizes on change and commits on blur/Enter via `setTicketPrefix`; every card's derived `shortId` (Unit 6.1) re-renders to the new prefix. Back returns to `#` (board).

## How to test / verify

- **General settings** (`apps/web/components/settings/general-settings.test.tsx`, green): starts empty (preview `#42`); typing `tec` → persists `TEC` (preview `TEC-42`); `a-b!cdef` → `ABCDE` (uppercase, symbols stripped, capped at 5); clears back to empty.
- **Project settings** (`apps/web/components/settings/project-settings.test.tsx`, green): create adds a project; rename-on-blur persists; recolor via the swatch popover sets the color (`blue` → `#4EA7FC`); archive removes it from the list.
- **Command** (`catalog.test.ts`, green): `setTicketPrefix` registered (dynamic count) and normalizes.
- Typecheck + lint + full web suite (164 tests) + static build: green. Pre-existing unrelated `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors remain.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

### Browser verification note

A live dark-mode screenshot of the settings view was not captured this iteration: the sign-in flow hit the shared API's ~5/min auth rate limit (see project memory `boardly-e2e-verification`) after this session's repeated fresh signups, and the preview's ref→coordinate click mapping was mis-scaled, so I could not re-enter the authenticated app. The settings view is a composition of components each verified by the rendering tests above (which mount the real `GeneralSettings`/`ProjectSettings` and drive them through the command layer), and Unit 6.7 captured a live dark-mode screenshot of the adjacent projects sidebar. Capture a settings screenshot opportunistically once auth is not throttled.

## Follow-ups / known gaps

- Board rename has no settings field yet (title is fixed to "Main board"); could be added to General.
- Project rows don't show card counts; a count/last-used hint could help.
- Import/export still doesn't carry projects (noted in Unit 6.6).
