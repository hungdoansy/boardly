# UNIT 14.1: Hotkey foundation — shared guard + leader-key mechanism

- **Plan unit:** 14.1 (`docs/plans/2026-07-24-001-feat-keyboard-shortcuts-nav-plan.md`)
- **Status:** done
- **Requirements:** R5, R6 (foundation for R1)
- **Commit(s):** _pending_

## What changed

- **Create `apps/web/lib/is-editable-target.ts`** — the single `isEditableTarget()`
  guard (INPUT / TEXTAREA / SELECT / `contentEditable`), extracted from the two
  identical copies that lived in `workspace-app.tsx` and `keyboard-nav.tsx`.
- **Create `apps/web/lib/hotkeys.ts`** — the Linear-style leader-key ("g" then …)
  mechanism:
  - `resolveLeader(state, registry, input)` — a **pure** reducer over
    `"idle" | "pending"` returning `{ next, action }` where
    `action ∈ { none, start, cancel, run }`.
  - `useLeaderHotkeys(registry, handlers)` — a hook that installs one
    **capture-phase** `document` keydown listener, arms on `g`, resolves the next
    key against `registry`, and runs the mapped handler. Timeout
    (`LEADER_TIMEOUT_MS = 1500`), window-blur, Escape, and any unregistered key
    all cancel a pending sequence.
  - Exports: `LEADER_CODE`, `LEADER_TIMEOUT_MS`, `resolveLeader`, `useLeaderHotkeys`,
    and the `LeaderState` / `LeaderInput` / `LeaderResult` types.
- **Create `apps/web/lib/hotkeys.test.ts`** — pure-reducer + guard tests.
- **Modify `apps/web/components/app/workspace-app.tsx`** — import the shared guard,
  delete the local copy (behavior unchanged).
- **Modify `apps/web/components/board/keyboard-nav.tsx`** — same swap.

No user-visible shortcut is added in this unit; it is the mechanism + guard
consolidation that Units 14.2–14.4 build on.

## Why (decisions)

- **Capture phase + `stopPropagation()`.** The board roving-nav listener lives on
  the board root and, on bubble, fires _before_ the document. A `g` `p` sequence
  would otherwise let the board act on `p` (cycle priority). Running the leader in
  the capture phase and consuming the resolving key guarantees the sequence wins
  deterministically, with no cross-module "is a leader pending?" flag leaking into
  `keyboard-nav.tsx`.
- **Pure reducer, DOM-thin hook** — mirrors the pure/adapter split already used in
  `keyboard-nav.tsx` (`moveFocus` etc.). Every transition is unit-tested without a
  DOM; the hook only wires listener/timeout/DOM reads.
- **Cancel does not consume the event.** After `g`, an unregistered key (or a
  modifier chord like `⌘K`) ends the sequence but is allowed to do its normal
  thing — so `g` then `⌘K` still opens the palette.
- **Owned-elsewhere guard reuses the `[data-nav="card"][aria-pressed="true"]`
  selector** (not a bare `aria-pressed`), because sidebar toggles (selected
  project row, Settings) also carry `aria-pressed="true"` and would false-positive
  (documented trap from `UNIT-7.10`).
- **`e.code`, not `e.key`,** for the leader keys — layout-independent, matching the
  existing single-letter board shortcuts.

## How it works

```
keydown (capture, document)
  → resolveLeader(idle|pending, registry, input)
      idle + "KeyG" (no modifier, not editable, not owned) → start  (arm, consume)
      pending + registered code                            → run    (consume, call handler)
      pending + Escape / unregistered / timeout            → cancel (do NOT consume)
      anything else                                        → none   (ignore)
```

Because the listener is capture-phase and consumes on `start`/`run`, the board
root never sees the `g` or the resolving key.

## How to test / verify

- `apps/web/lib/hotkeys.test.ts`:
  - arming: bare `g` arms; non-leader key is ignored; modifier / editable / owned
    all suppress arming.
  - resolving: `p` after `g` → `run: project-switcher`; unregistered key → cancel;
    Escape → cancel; timeout while pending → cancel; timeout while idle → none.
  - `isEditableTarget` parity for input/textarea/select/contentEditable + negatives.
- Regression: existing `workspace-app.test.tsx` and `keyboard-nav.test.tsx` still
  pass against the shared guard (behavior-preserving extraction).
- Run: `pnpm --filter @boardly/web test` (or `pnpm test`), `pnpm typecheck`, `pnpm lint`.

## Review follow-ups (ce:review)

- **Pending-branch guards (correctness/adversarial/frontend-races, P1).**
  `resolveLeader`'s `pending` branch now re-checks `hasModifier`/`editable`/`owned`
  and cancels (without consuming) — so after `g`, a keystroke typed into a field, a
  ⌘-chord, or an overlay/drag that opened during the 1.5s window is no longer
  hijacked into running a binding. Covered by new reducer + hook tests.
- **Shared keyboard-ownership helper (maintainability, P2).** The
  `[data-nav="card"][aria-pressed="true"]` / `[role="dialog"][data-state="open"]`
  selectors moved to `apps/web/lib/keyboard-ownership.ts` (`isCardDragActive`,
  `isOverlayOpen`, `keyboardOwnedElsewhere`), now used by the leader, the ESC ladder,
  and the global `c` guard instead of three copy-pasted queries.
- **Generic `Id` typing (kieran-typescript, P2).** `useLeaderHotkeys<Id extends string>`
  ties registry values to handler keys — a value with no matching handler is now a
  type error, not a silent runtime no-op.
- **Exhaustiveness guard (kieran-typescript, P3).** The `LeaderResult` switch has a
  `never`-typed default so a future variant is a compile error.

## Follow-ups / known gaps

- The registry is wired to a real binding (`g p`) in **UNIT 14.2**; until then the
  hook is exercised only by tests.
- Additional `g`-prefixed destinations (`g s` Settings, etc.) are a later unit —
  the registry accepts them without mechanism changes.
