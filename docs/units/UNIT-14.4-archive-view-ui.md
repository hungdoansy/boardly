# UNIT-14.4 — Archive view UI (component, sidebar nav, ESC ladder, drawer Restore)

Part of the Archive view batch (`docs/plans/2026-07-24-001-feat-archived-cards-view-plan.md`, Unit 4).

## What changed

The user-facing Archive view and everything that makes it reachable and coherent.

- **Component** (`apps/web/components/archive/archive-view.tsx`): a full-area view (same shell shape
  as `SettingsView`) listing archived cards, most-recently-archived first. Each row: status glyph,
  mono `shortId`, title (line-through when terminal), the configured `BadgeRow`, a relative
  "archived <time> ago" (`formatRelativeTime(deletedAt)`), and hover/focus **Restore**
  (`ArchiveRestore`) + **Delete** (`Trash2`) controls. The row's main region is a button that opens
  the card in a **local-state** `CardDetail` drawer (so an archived card — unresolvable via the
  live-cards-only ticket hash — is still viewable before restoring). Delete goes through the shared
  confirm `Dialog`. Empty state: a calm centered "No archived cards." with an `Archive` glyph.
- **Shell** (`apps/web/components/app/workspace-app.tsx`):
  - `Shell` reads `useArchiveRoute()` and renders `settings ? Settings : archive ? Archive : Board`
    (routes are hash-exclusive, so at most one full-area pane is open).
  - `Sidebar` gains an **Archive** nav item (`Archive` icon, `aria-pressed`) directly above
    Settings, styled identically.
  - `useGlobalKeyboard`'s ESC ladder gains an Archive rung: Settings → Archive → reset scope to All.
    It still yields when a dialog/sheet/drag owns ESC (`escIsOwnedElsewhere`).
- **Drawer** (`apps/web/components/card/card-detail.tsx`): the footer shows **Restore**
  (`ArchiveRestore` → `unarchive`) instead of **Archive** when `card.archived`, so the drawer is
  coherent whether the card was opened from the board or the Archive view.
- **Activity** (`apps/web/components/card/activity.tsx`): renders the new `unarchived` entry as
  "Restored" (`ArchiveRestore`). Without this the drawer crashed when a still-open archived card was
  restored (the `describe()` switch returned `undefined` for the new kind) — caught by the
  card-detail test.

## Why

- **Top-level view, not a Settings section:** archived cards are primary, potentially numerous
  content, so they get a scannable full-area destination with its own route/sidebar entry — unlike
  the handful of hidden projects that live in Settings.
- **Local-state drawer, not the ticket hash:** `useSelectedCard` resolves the hash over live cards
  only. `CardDetail`/`useCardById` resolve _any_ card by id (`getCard` ignores `archived`), so a
  local `openId` opens archived cards with no hash-resolver change (deferred, see plan).
- **Row layout puts the open-button and the action buttons as siblings** (not nested), so clicking
  Restore/Delete never also opens the drawer — no `stopPropagation` gymnastics, and valid a11y
  (no nested interactives).
- Restore is reversible → no confirm; permanent delete reuses the existing irreversible-delete
  confirm dialog.

## How it works

`useArchivedCards()` feeds the list (deep `useY`, live). Restore/Delete call the command-backed
`useCardActions().unarchive` / `.delete`. The drawer is a sibling `CardDetail` fed by local `openId`
state; ESC closes the Radix sheet first (the global ladder yields via `escIsOwnedElsewhere`), so ESC
inside the drawer never steps the ladder.

## How to test / verify

- **Component** (`apps/web/components/archive/archive-view.test.tsx`): lists archived cards
  newest-first; empty state; row Restore removes the card from the archive; Delete confirms
  (cancel keeps / confirm hard-deletes); opening a row shows the detail drawer with a **Restore**
  footer (not Archive); inline Restore does not open the drawer.
- **Shell** (`apps/web/components/app/workspace-app.test.tsx`): sidebar order
  logo→search→projects→**Archive**→Settings→account; Archive toggles the pane + `aria-pressed`;
  ESC exits Archive without touching scope; Settings takes ESC precedence over Archive.
- **Drawer** (`apps/web/components/card/card-detail.test.tsx`): archived card shows Restore (not
  Archive) and restoring closes the drawer.
- **Run:** full workspace `typecheck`, `lint`, and `test` (web 239) green; `@boardly/web build`
  compiles.
- **Dark mode (browser):** verified against the running dev stack — sidebar Archive item, the
  populated Archive view, the detail drawer opened from a row (Restore footer), and Restore/Delete
  behavior. Screenshot in the PR/session.

## Follow-ups / known gaps

- No filter/sort/group or bulk (multi-select) actions inside the view — deferred (plan Scope).
- Shareable `#`-routed open of an archived card is deferred (resolver is live-cards-only).
