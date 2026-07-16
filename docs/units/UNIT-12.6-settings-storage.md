# UNIT 12.6: Settings → Storage section (usage meters)

- **Plan unit:** 12.6 (`docs/plans/2026-07-15-001-feat-description-image-attachments-plan.md` → Unit 6)
- **Status:** done
- **Requirements:** R6 (Settings shows db + files usage vs configured caps)
- **Commit(s):** _(this commit)_

## What changed

- **`apps/web/lib/use-storage-usage.ts`** (new) — `useStorageUsage()`: fetches `GET /api/storage` via
  `apiClient.authFetch` once on mount; returns `{ data, loading, error }`.
- **`apps/web/components/settings/storage-settings.tsx`** (new) — `StorageSettings` with two usage
  meters (Database, Files); exports the pure `formatBytes` helper.
- **`apps/web/components/settings/settings-view.tsx`** — adds the `"storage"` section to the sub-nav
  (`SECTIONS`/`TITLES`) as the last item and renders `<StorageSettings />`.
- **`docs/design/DESIGN.md`** — new §7.0 "Usage meter" documenting the primitive.
- **Tests:** `apps/web/components/settings/storage-settings.test.tsx` (4).

## Why (decisions)

- **Fetch on mount, no polling.** The section refetches whenever it's opened (remounts); storage
  changes slowly, so live polling would be wasteful.
- **`nearCap` emphasis at ≥90%.** The fill turns `--danger` as a quiet "getting full" signal without
  a separate alert.
- **`formatBytes` base-1024 with informal units.** Matches how the caps read (`1 GB` for 1 GiB); the
  limits come from the endpoint so the UI hardcodes no cap.
- **Limits fetched, not hardcoded.** The meter renders whatever caps the server reports.

## Design (UI unit)

Per DESIGN.md §7.0: icon (`Database`/`HardDrive` lucide SVG) + label, right-aligned `used of limit`
(tabular-nums), a 6px `--bg-elevated` track with an `--accent` fill (→ `--danger` ≥90%), width
clamped 0–100%, width transition `--dur-base` + `motion-reduce:none`. Loading → two pulse skeletons;
error → a quiet `role="alert"`. `role="progressbar"` + `aria-valuenow` for a11y. Dark-mode first; all
tokens.

## How to test / verify

- `pnpm --filter @boardly/web test storage-settings.test.tsx` → 4 passed: `formatBytes` boundaries
  (B/KB/MB/GB, fractional); both meters render with `used of limit` + correct `aria-valuenow`;
  over-cap clamps to 100% and the fill goes `--danger`; failed fetch → inline `role="alert"`.
- `typecheck` + `lint` clean; full web suite green (243).
- The backing endpoint (`GET /api/storage`) was verified over real HTTP in UNIT-12.5, returning real
  db + files byte counts.

## Follow-ups / known gaps

- **Live dark-mode screenshot** of Settings → Storage is the one remaining manual check — the shared
  Playwright profile was locked during this session, so the browser walkthrough wasn't captured;
  component + endpoint coverage is green. Open Settings → **Storage** to see both meters.
- Display-only caps; enforcing a hard upload limit is deferred (see the plan).
