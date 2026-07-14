# Boardly — Repo Rules (read first, every session)

Authoritative working rules for building Boardly. These bind humans and agents (including the
autonomous build loop). When something here conflicts with a task prompt, **stop and reconcile** —
do not silently deviate.

Pointers:

- Product/architecture overview: `PLAN.md`
- Detailed build plan (source of truth for the loop): `docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md`
- Design system (binding for all UI): `docs/design/DESIGN.md`
- Per-unit change docs: `docs/units/` (convention in `docs/units/README.md`)

---

## 1. Documentation discipline (required)

**Every task/subtask (implementation unit) gets an intensive, standalone doc** in `docs/units/`,
named `UNIT-<id>-<slug>.md` (e.g. `UNIT-1.1-yjs-schema.md`). It must cover:

- **What changed** — files, modules, data shapes, public APIs/commands added or altered.
- **Why** — the decisions and their rationale (and rejected alternatives when non-obvious).
- **How it works** — enough detail that a new contributor understands the mechanism without reading every line.
- **How to test/verify** — the exact tests written and how to run them; the manual/e2e checks; for UI, what "correct" looks like (reference `DESIGN.md`).
- **Follow-ups / known gaps** — anything deferred.

**Docs-first is welcome and encouraged.** If writing the doc (or a design note) _before_ implementing
clarifies the work, do that — **and commit the doc before continuing** to implementation. A unit's
doc must exist and be committed by the time its checkbox is ticked (see the plan's Definition of Done).

Keep `PLAN.md`, the plan file, and `DESIGN.md` current when a change invalidates them.

**Same-commit rule (enforced by a soft pre-commit hook).** Any commit that changes product
source — `apps/**`, `packages/**/src`, or any `**/src-tauri/**` — must stage at least one doc
surface in the _same_ commit:

- a `docs/units/UNIT-<id>-*.md` for a feature / spec / behavior change (a new unit doc, or an update
  to the owning unit's **Follow-ups / known gaps** for a bug-fix or micro-polish);
- `docs/design/DESIGN.md` for **any** visual/interaction change — including icon or glyph swaps,
  focus-ring or tab-order changes, badge/token/spacing tweaks, and new reusable primitives (these
  are precisely the changes historically shipped undocumented);
- `docs/plans/*` or `PLAN.md` for a scope change.

The commit subject **should** carry the `UNIT-<id>` it advances. A `pre-commit` hook
(`scripts/check-docs-touched.mjs`, run via husky) **warns** — it never blocks — when source is
staged with no doc surface; heed it, or for a deliberate exception just proceed. Do **not** ship code
first and backfill docs later, and never bury product code in a `docs(...)`-typed commit.

## 2. Design (binding — see `docs/design/DESIGN.md`)

- The UI must look and feel like **Linear**: fast, dense, calm, keyboard-first, content-first.
- **Dark mode is the priority.** Design and verify dark mode first; light mode is a later, secondary pass. Every screenshot check is against dark mode unless a unit is explicitly about light mode.
- **Use shadcn/ui as the component reference/base.** Prefer composing shadcn/ui primitives (Radix under the hood) over hand-rolling; restyle them to the Boardly tokens in `DESIGN.md`. Do not pull in a second component library.
- Use the **design tokens** in `DESIGN.md` (CSS variables). Never hardcode ad-hoc colors/spacing/radii in components.
- **Icons are SVGs, never glyphs.** Every icon/affordance (arrows, checks, chevrons, dots, ×, …) is a `lucide-react` or bundled provider SVG — never a Unicode glyph (`→ ✓ × ⋯`). See `DESIGN.md` §7.1 for the ban list and the narrow exceptions (keyboard keycaps in `<kbd>`, typographic punctuation in prose).
- **Transitions: measured.** Add motion where it aids comprehension (hover, popover/dialog/sheet enter-exit, drag feedback, checkbox/expand) using the durations/easing in `DESIGN.md`. Do **not** over-animate (no gratuitous page/list-wide motion, no long durations, no animating expensive layout on large lists). Respect `prefers-reduced-motion`. Missing a needed transition is as much a defect as adding a superfluous one.
- Any new/changed screen or component: note the design in that unit's doc and, if it introduces reusable patterns/tokens, update `DESIGN.md`.

## 3. Engineering standards

**React best practices**

- Function components + hooks only. Obey the rules of hooks; stable, complete dependency arrays.
- **Derive, don't synchronize** — compute from state/props during render instead of mirroring into extra state via effects. Effects are for _external_ synchronization only (subscriptions, DOM, network), not data flow.
- Keep the Yjs↔React binding (`useY`) subscriptions **scoped** so a change re-renders only what depends on it. Memoize selectors; give lists stable keys (entity ids, never array index).
- Colocate state at the lowest sensible level; lift only when shared. No prop-drilling beyond ~2 levels — use context sparingly and deliberately.
- All mutations go through the **command layer** (`packages/commands`) — never mutate Yjs types directly from components (agent-native parity, see plan R13).
- Static export constraints (see plan): no runtime SSR/route-handlers/server-actions; guard `window`/`localStorage`/IndexedDB to the client.

**Frontend best practices**

- Semantic HTML; accessible by default — labels, roles, `aria-*`, focus management, `focus-visible` rings. Everything reachable and operable by keyboard (this is a product goal, not just a11y).
- No unnecessary layout shift; virtualize or window long card lists if they threaten scroll/drag performance (perf is a pillar — R2).
- Prefer CSS (Tailwind v4 tokens) over JS for styling and simple animation; use transforms/opacity for motion (compositor-friendly), not layout properties.
- TypeScript strict; no `any` without a written reason; validate all external/agent input with zod at the boundary.

## 4. Dependencies — pin exact versions (required)

- **Every `package.json` pins exact versions — no `^`, no `~`, no ranges.** e.g. `"next": "16.2.6"`, not `"^16.2.6"`.
- Pin the toolchain: Node **24.15.0** (`.nvmrc` + `engines`), and set `packageManager` to an exact pnpm version.
  Chosen to match this machine's default node, so no `PATH`/`nvm use` juggling is needed before
  running install/build/test/node commands. If the default node on a given machine ever drifts from
  this pin, run `nvm use` (or prefix the pinned bin) rather than assuming the default is correct.
- Commit `pnpm-lock.yaml`. When adding a dep, pin the exact resolved version and record why in the unit doc.
- Known fixed versions: Next.js `16.2.6`; React / react-dom `19.2.x` (pin the exact patch that installs); the rest pinned exactly at install time.

## 5. Git (inherits the user's global rules)

- **Never `git push` and never create a branch without the user's explicit in-the-moment instruction.** Committing locally is always fine.
- **Commit per unit** once its Definition of Done is met (docs included). Docs written docs-first are committed before implementation continues.
- Commit-message footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## 6. Definition of Done

The per-unit Definition of Done lives in the plan (Operational / Overnight-Loop Notes) and includes:
tests + typecheck/lint/build green; e2e + dark-mode screenshot for user-facing flows; **the unit doc
written and committed**; exact-version deps; design + engineering rules above satisfied.
