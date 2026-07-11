# UNIT P2: Demo board seed script

- **Plan unit:** none (developer tooling requested directly by the user, 2026-07-11)
- **Status:** done
- **Commit(s):** _this unit's commit_

## What changed

New `packages/sync/scripts/seed-demo-board.ts` — a standalone Node script that seeds an
**extensive** demo board into a running Boardly stack, exercising every implemented feature so the
app can be explored (or screenshotted) with realistic content.

The seeded board (`Boardly Demo — Everything`) contains:

- **5 columns** with WIP limits (Todo 5, In Progress 3, In Review 2).
- **12 cards** spanning every workflow status (Backlog → Todo → In Progress → In Review → Done →
  Canceled), so the list lens shows every status icon and terminal strike-through.
- **All priorities** (None…Urgent) and **all severities** (S1…S4).
- **Due dates** covering overdue / today / this-week / future (drives the due-window filters).
- **7 labels** across the palette; cards carry multiple labels.
- **Links for every provider** — Linear, Slack, GitHub, Claude, and a generic URL.
- **Checklists** with completed + open items (progress bars, `done/total` counts).
- **Markdown descriptions.**
- **Rich activity logs** — every status/priority/severity/due mutation appends an entry.
- **3 saved views** exercising both lenses: "My urgent work" (board, grouped by priority,
  OR-filter), "Bugs" (list, label filter, sorted), "Due this week" (list, due-window filter,
  grouped by status).

## Why / how it works

The script persists through the **real server**, exactly like the web client, so the board shows
up in the running app after login:

1. **Authenticate** over HTTP (`/auth/login`, falling back to `/auth/signup` + login) → access
   token; `userId` is the JWT `sub`.
2. **Register ownership** via `POST /boards` so the board's sync room authorizes (`authz.ts`
   checks `board.ownerId === userId`).
3. **Connect** the workspace (`workspace:<userId>`) and board (`board:<id>`) Yjs docs over the
   `/sync` WebSocket with `HocuspocusProvider`, minting a one-time ticket per connect
   (`POST /sync/ticket`). Node 22's global `WebSocket` is used (no polyfill). A Node client sends
   no `Origin` header, which `authz.ts` allows.
4. **Mutate** the docs with the `@boardly/sync` typed accessors, then wait for Hocuspocus to
   debounce-persist to Postgres before destroying the providers.

**Why the sync accessors, not `@boardly/commands`:** the script lives in `packages/sync`'s module
graph (the only place that resolves `@hocuspocus/provider` without pulling `@boardly/commands`,
which isn't a sync dependency). The accessors are the exact primitives the command layer wraps and
they append the same activity entries, so the seeded history is faithful. A fixed, minute-stepped
clock makes ordering deterministic.

## How to test / verify

Prereqs: Node 22.17.1; Docker `boardly-db` up; the API server running on :8787.

```bash
export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
apps/server/node_modules/.bin/tsx packages/sync/scripts/seed-demo-board.ts
```

Env overrides: `API_URL` (default `http://localhost:8787`), `SEED_EMAIL` (default
`demo@boardly.app`), `SEED_PASSWORD` (default `demo-boardly-2026`), `BOARD_TITLE`. Then log into the
app (http://localhost:3000) with the printed credentials.

**Verified (2026-07-11):** ran the script (12 cards, 5 columns), then logged into the dev server
and screenshotted the **board** (WIP counts, priority/severity/due/label/checklist badges, short
ids), a feature-rich **card drawer** (markdown, 4/4 checklist, labels, Linear+Slack links,
activity), and the **list lens** (per-status icons, strike-through on Done/Canceled). Script
`tsc --strict` clean, eslint + prettier clean.

## Follow-ups / known gaps

- The script re-seeds a **new** board each run (fresh id) under the same account — it does not
  clean up prior demo boards. Re-run and archive extras from the UI if the sidebar gets noisy.
- It uses the `@boardly/sync` accessors directly rather than `@boardly/commands`; if the command
  package ever becomes resolvable from this module graph, prefer routing through it (R13).
