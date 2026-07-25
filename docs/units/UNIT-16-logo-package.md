# UNIT-16 — Brand logo package (`@boardly/logo`) as single source of truth

**Plan:** `docs/plans/2026-07-25-001-feat-logo-package-brand-source-of-truth-plan.md`
**Status:** done (2026-07-25)

## What changed

A new workspace package, **`@boardly/logo`**, now owns the Boardly brand mark. Every surface that
shows the logo — the in-app sidebar, the browser favicon, and the desktop app icon — sources from it.

**New package `packages/logo/`:**

- `assets/mark.svg` — the canonical bare mark (the "airy B"), moved here from the loose staged
  `apps/web/public/boardly-mark.svg` (which is deleted).
- `assets/mark-padded.svg` — the **same** mark with bigger padding (~14% vs the tight mark's ~3%) so
  it reads better at small OS-icon sizes; the desktop app-icon source. Authored in Figma.
- `assets/app-icon.svg` — a **separate** square composition: the mark centered on a dark slate
  squircle tile (`#2A2C42→#15161F`, `rx=224`), Linear-style. The web apple-touch/PWA icon.
- `assets/generated/` — **committed** rasters emitted by the generate script: `favicon.svg` (copy of
  the mark), `favicon-32.png`, `icon-1024.png` (padded mark @1024 flattened onto a flat Canvas
  `#F6F7F8` background via `generate.mjs` `ICON_BG` — the desktop `.icns`/`.ico` source; the favicon
  stays transparent), `apple-touch-icon.png` (180²), `app-icon-1024.png` (the tiled web apple-touch/PWA source). The
  generator picks rasterization density per source (~2× supersample) so 1024 outputs stay crisp
  whether the source viewBox is 128 (marks) or 1024 (tile).
- `src/mark-svg.ts` — `MARK_SVG`, the mark markup as a string (canonical for the React path).
- `src/scope-svg-ids.ts` — a self-contained copy of the web app's id-scoping helper (keeps the
  package dependency-free).
- `src/boardly-mark.tsx` — `<BoardlyMark/>`: inlines `MARK_SVG` with `useId`-scoped gradient ids.
- `src/index.ts` — exports `BoardlyMark` and `MARK_SVG`.
- `src/svg-raw.d.ts` — ambient decl for Vite `?raw` imports (used by the parity test).
- `scripts/generate.mjs` — SVG→raster generator (`sharp` 0.35.3, pinned devDep). **Manual**, run on
  logo change: `pnpm --filter @boardly/logo generate`.
- Standard `package.json` / `tsconfig.json` / `vitest.config.ts` mirroring `@boardly/ui`.

**Web wiring:**

- `scripts/sync-logo.mjs` (repo root) copies the favicon set (`favicon.svg`, `favicon-32.png`,
  `apple-touch-icon.png`) from `packages/logo/assets/generated/` into the **git-ignored**
  `apps/web/public/logo/`. Exports `copyLogoAssets` for unit testing; `scripts/sync-logo.test.mjs`.
- `apps/web/package.json` — `dev`/`build` run the sync **inline** (`node ../../scripts/sync-logo.mjs
&& next …`), and depend on `@boardly/logo`.
- `apps/web/app/layout.tsx` — `metadata.icons` points at `/logo/favicon.svg`, `/logo/favicon-32.png`,
  `/logo/apple-touch-icon.png`.
- `apps/web/components/app/workspace-app.tsx` — the sidebar `LayoutGrid`-in-a-`bg-primary`-box is
  replaced by `<BoardlyMark className="size-6" />`; the `LayoutGrid` import is dropped.
- `.gitignore` — ignores `apps/web/public/logo/`.
- `eslint.config.mjs` — adds a `**/*.{js,cjs,mjs}` block with Node globals (the generate/sync
  scripts need them; also covers the repo's existing root `scripts/*.mjs`).
- `vitest.config.ts` — adds `packages/logo` to the project list.

**Desktop:**

- **The desktop app icon is the _bare_ transparent mark** (not the tile) — a deliberate choice: the
  mark reads as the Dock/taskbar icon directly. Regenerating it is automated:
  - `scripts/gen-icons.mjs` (wired as `pnpm --filter @boardly/desktop icons`) runs `tauri icon` on
    `packages/logo/assets/generated/icon-1024.png` (the padded mark) — producing `icon.icns` (macOS), `icon.ico`
    (Windows), and the Linux/generic PNGs all from the same bare mark — then **prunes** everything
    `tauri icon` also emits that this desktop-only app never bundles (the `ios/`/`android/` dirs, the 9
    `Square*Logo.png` + `StoreLogo.png` Microsoft-Store/MSIX tiles, `64x64.png`, `icon.png`). It keeps
    exactly the 5 files `tauri.conf.json`'s `bundle.icon` references: `32x32.png`, `128x128.png`,
    `128x128@2x.png`, `icon.icns`, `icon.ico`.
  - Full refresh on logo change (the documented entry point): **`pnpm logo:generate`** (root script =
    `pnpm --filter @boardly/logo generate && pnpm --filter @boardly/desktop icons`).
  - `apps/desktop/package.json` gains the `icons` script; the root `package.json` gains `logo:generate`.
    `tauri.conf.json` icon references are unchanged. Registered in `README.md` (Common commands +
    Monorepo layout), `CLAUDE.md` §2, and `AGENTS.md` so the workflow is discoverable.

**Docs:** `docs/design/DESIGN.md` §7.4 (brand mark & app icon).

## Why

- **One source of truth (R1).** The mark landed as a loose, unreferenced file; nothing owned it.
  Centralizing in a package kills drift and gives each surface a defined consumption path.
- **Three paths, by need (Key Decision).** In-app wants a themeable, request-free inline SVG →
  React component. The favicon wants a served file → copy into `public/`. OS icons want raster →
  a manual generate + `tauri icon`. Forcing one mechanism on all three would create drift or dead weight.
- **Bare mark ≠ app icon.** A transparent mark floats poorly at OS icon sizes, so `app-icon.svg` is a
  distinct square tile. (User-confirmed: composed tile.)
- **Inline component, not `<img>`.** No request, no flash, crisp at any DPI, and `useId`-scoped ids
  prevent the gradient-id collision two marks on one page would otherwise cause. (User-confirmed.)
- **Copy, not symlink, into `public/`.** Next static export serves only physical files under
  `public/`; a real copy is portable across the Docker prod build and desktop `frontendDist`.
- **Inline sync, not a `prebuild` hook.** Turbo runs the exact task script and **skips** npm
  `pre*`/`post*` lifecycle hooks, so a `prebuild` copy would silently no-op under `turbo run build`.
- **Generate is manual + committed; dev/build only copies.** Keeps `sharp` (native) off the hot path
  and dev/build fast and dependency-light.

## How it works

- `<BoardlyMark/>` renders a wrapper `<span data-boardly-mark>` (`aria-hidden`, sized by `className`
  or the `size-6` default; `[&_svg]:size-full` lets CSS override the SVG's `width/height`) and injects
  `scopeSvgIds(MARK_SVG, useId())` — exactly the `provider-icon` pattern. `MARK_SVG` is fixed package
  data (never user input), so `dangerouslySetInnerHTML` is safe.
- `generate.mjs` rasterizes at `density: 384` so downscaled small sizes stay crisp; outputs are committed.
- `sync-logo.mjs` `mkdir`s the target, copies each asset, and throws an actionable "run …generate"
  error if a source is missing. Runs on every `next dev`/`next build`; the folder is regenerated each time.
- The mark's brand gradients are **literal** colors, a deliberate exception to the "no hardcoded
  colors" rule (DESIGN §2/§10) — a logo is a fixed brand asset, not a themed surface.

## How to test / verify

Automated (all green):

- `pnpm --filter @boardly/logo test` — 5 tests: renders 2 gradients + 4 paths; `size-6` default;
  `className` overrides sizing; **per-instance id scoping** (two marks never share a gradient id and
  each path references its own); **parity** between `assets/mark.svg` (read via `?raw`) and `MARK_SVG`.
- `pnpm exec vitest run --project scripts` — `copyLogoAssets`: copies all assets into a fresh dir;
  overwrites on repeat (idempotent); throws on a missing source.
- `apps/web` `workspace-app.test.tsx` — sidebar renders `[data-boardly-mark] svg` beside the "Boardly"
  wordmark; existing placement test unchanged.
- Workspace `typecheck` / `lint` / `test` / web `build` green.

Manual:

- `pnpm --filter @boardly/logo generate` → inspect `assets/generated/` (app-icon reads clearly at
  180px and 32px). Verified in-session.
- Web dev server: the sync logs "synced 3 logo asset(s)"; `/logo/favicon.svg|favicon-32.png|
apple-touch-icon.png` all serve `200`; `metadata.icons` emits the three `<link>` tags; browser tab
  shows the mark. Verified in-session.
- Desktop app icon: regenerated `128x128@2x.png` shows the mark on the dark tile. **Dock/taskbar**
  appearance should be confirmed in a real `pnpm --filter @boardly/desktop dev` window (per
  boardly-desktop-verification: browser MCP drives Chromium, not the WKWebView).

## Follow-ups / known gaps

- **No web `.ico`** — modern SVG favicon + PNG fallbacks are used; add an `.ico` encoder only if a
  legacy target needs it.
- **PWA manifest / maskable 192·512 icons** — deferred (no installable-web work yet).
- **`scope-svg-ids` duplicated** in `@boardly/logo` and `apps/web/components/card/` — intentional to
  keep the package dependency-free; could later be de-duped by having web import from the package.
- **Desktop Dock icon** not yet eyeballed in a live `tauri dev` window (Rust build); icon _assets_ are
  verified from the 1024 source.
- **`sharp`** installed cleanly without an `onlyBuiltDependencies` entry (prebuilt binary), so
  `pnpm-workspace.yaml` was left unchanged.
