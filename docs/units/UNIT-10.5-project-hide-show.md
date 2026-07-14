# UNIT 10.5: Project hide / show (reuse `archived`)

- **Plan unit:** Unit 5 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R2 (hide a project from the board; restore it from Settings; cards keep membership)
- **Dependencies:** none

## What changed

- **`packages/sync/src/board-doc.ts`** — `unarchiveProject(doc, projectId, now)` (clears
  `archived` + `deletedAt`) and `listArchivedProjects(doc)` (archived, ord-sorted).
- **`packages/commands/src/commands/project.ts`** — new `showProject` command; registered in
  `packages/commands/src/catalog.ts` (agent-native parity — an agent can restore a project too).
- **`apps/web/lib/use-projects.ts`** — `useArchivedProjects()` hook + a `show(projectId)` action
  on `ProjectActions` (alongside the existing `archive`, which is the "hide" verb).
- **`apps/web/components/settings/project-settings.tsx`** — the per-row action is relabeled
  **Hide** with a neutral `EyeOff` icon (dropped the destructive-red hover); a new **Hidden**
  section lists archived projects, each with a **Show** button (`Eye`) that restores it.
- **Tests:** `packages/commands/src/commands/project.test.ts` (archive → listed as archived;
  `showProject` restores; card keeps `projectId` throughout);
  `apps/web/components/settings/project-settings.test.tsx` (Hide moves a project to the Hidden
  section; Show restores it).

## Why

- **Reuse `archived`, don't add a second flag.** There is no separate project-archive concept in
  the product, and the request was explicitly a reversible hide/show. The existing `archived`
  boolean already means "hidden from the list; cards keep their `projectId`" — it only lacked a
  restore path and neutral UI language. No new data field, no migration.
- **Neutral affordance.** "Hide"/"Show" with eye icons reads as a visibility toggle, not a
  destructive action — matching the reversible semantics (the old red Archive button implied
  permanence).

## How it works

`archiveProject` already sets `archived: true`; `unarchiveProject` sets it back to `false`.
`listProjects` (sidebar/board) keeps only non-archived; `listArchivedProjects` is its complement.
Both hooks subscribe to the same `boardProjects` Y.Map (deep), so hiding/showing re-renders the
active list, the sidebar, and the Hidden section together. Hide/show never touch cards, so a
card's `projectId` is preserved across the round-trip.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/commands exec vitest run commands/project.test.ts` → 5 passed;
  `pnpm --filter @boardly/web exec vitest run components/settings/project-settings.test.tsx` → 5 passed.
- **Gates:** `@boardly/sync` / `@boardly/commands` / `@boardly/web` `typecheck` + `lint` green.
- **Manual:** in Settings → Projects, click Hide on a project → it leaves the sidebar and the
  active list and appears under "Hidden"; click Show → it returns to both, its cards intact.

## Follow-ups / known gaps

- If the _currently-selected_ project scope is hidden (only reachable from Settings, where the
  board isn't shown), the URL hash still points at it; the board does not crash and the user can
  pick "All" or another project. A scope auto-reset was intentionally not added (it would need an
  effect that mirrors derived state). Minor cosmetic edge, noted for a future pass.
