# UNIT-23: Release pipeline

Ports the build and versioning pipeline from the sibling `nodl` repo. One manual GitHub Actions
workflow validates a version, builds the desktop app, bumps the version in the repo, writes the
changelog, tags, and publishes a GitHub Release.

> **Superseded in part by `docs/units/UNIT-24-shared-release-actions.md`.** The changelog, target
> selection, tag and GitHub Release steps now come from `hungdoansy/desktop-release-actions`, and
> `resolve-targets.mjs`, `generate-changelog.mjs` and `prepend-changelog.mjs` are gone. The target
> table and the Tauri notes below still apply.

## What changed

- `.github/workflows/release.yml`: the workflow. Trigger: `workflow_dispatch` only.
- `scripts/release/resolve-targets.mjs`: turns the target checkboxes into the build matrix. Holds
  the table of all four platforms.
- `scripts/release/set-version.mjs`: stamps `X.Y.Z` into every file carrying the app version.
- `scripts/release/generate-changelog.mjs`: commit subjects to changelog lines, optionally polished
  by Gemini.
- `scripts/release/prepend-changelog.mjs`: adds the release block to `apps/desktop/CHANGELOG.md`
  (the first release creates the file).
- `scripts/release/release.test.mjs`: tests for all of the above.
- `README.md`: new "Releasing" section.

No product source changed, and no dependency was added.

## How it works

Run it from the Actions tab: **Release > Run workflow**, enter a version, tick targets.

1. **prepare** (ubuntu): installs, rejects a malformed version or an existing tag, resolves the
   matrix, runs lint + typecheck + test, generates the changelog.
2. **build** (one job per ticked target): installs Rust and pnpm deps, stamps the version, runs
   `tauri build --target <triple> --bundles <bundles>`, uploads the installers.
3. **release** (ubuntu): checks out `main`, re-applies the changelog and version, commits
   `release: vX.Y.Z`, tags, pushes both, creates the GitHub Release, deletes the temporary artifacts.

### Build targets

| Checkbox      | Default | Runner           | Rust target                | Output           |
| ------------- | ------- | ---------------- | -------------------------- | ---------------- |
| `mac_arm64`   | on      | `macos-latest`   | `aarch64-apple-darwin`     | `.dmg`           |
| `mac_x64`     | off     | `macos-latest`   | `x86_64-apple-darwin`      | `.dmg`           |
| `windows_x64` | off     | `windows-latest` | `x86_64-pc-windows-msvc`   | `.exe` (NSIS)    |
| `linux_x64`   | off     | `ubuntu-latest`  | `x86_64-unknown-linux-gnu` | `.deb`, AppImage |

To build a platform once, tick it in the run dialog. To build it on every run, set its `default` to
`true` in `release.yml`.

### Version files

`set-version.mjs` writes four files: `apps/desktop/package.json`, `tauri.conf.json` (the one the
bundle reads), `Cargo.toml`, `Cargo.lock`. It patches each in place, so formatting survives, and
throws if a pattern stops matching, so a build can never ship with a stale version.

## Why

- **Checkboxes, not commented-out matrix entries.** GitHub does not expose `matrix` to a job-level
  `if`, so a static matrix can only skip a target by editing it or by paying for a runner that does
  nothing. A computed matrix keeps all four targets live and lets a fork enable one with no code edit.
- **`APPLE_SIGNING_IDENTITY: "-"`, set in the workflow only.** Without it the `.app` has a linker
  signature on the binary alone and `codesign --verify` fails, which macOS reports on a downloaded
  copy as a damaged app. Local `tauri:build` is unchanged. Ad-hoc signing is not Developer ID
  signing: Gatekeeper still blocks the first launch.
- **Scripts live in `scripts/release/`, not `.github/scripts/` as in nodl,** so the existing
  `scripts` vitest project picks up their tests.

### Differences from nodl

- Tauri instead of electron-builder, so the build job adds Rust, a Rust cache and Linux system
  packages. `pnpm/action-setup` is `v6` because this repo is on pnpm 11.
- Dropped the About-dialog changelog step: Boardly has no such dialog, so only the release job
  writes the changelog.
- Dropped the per-OS unit test re-run: `prepare` already tests, and macOS minutes are expensive.
- Dropped `deploy-web.yml`: it triggers nodl's Vercel landing page, and Boardly has no equivalent.
- Changelog also filters `test`, `chore`, `ci`, `build`, `style` and `refactor`, scoped or not, and
  strips `(UNIT-x)` and `(#n)` suffixes.
- The version input reaches the shell through `env`, not by direct interpolation.
- Gemini calls use the stable `/v1` path with `gemini-3.5-flash`, confirmed with a real key by cURL.
  nodl's `gemini-2.5-flash` returned a 404 on the first run because Google has closed it to new
  users. Override the model with `GEMINI_MODEL`.
- A Gemini failure shows a one-line warning. The API response body goes to the step log only.
- `Test` passes `--reporter=default`. In GitHub Actions, Vitest otherwise adds its `github-actions`
  reporter, which appends a "Vitest Test Report" to the run summary once per package (8 here). The
  cost: a failing test is no longer annotated inline, though it still fails the step and shows in
  the log.

## How to test

```bash
pnpm exec vitest run --project scripts
```

Checks run for this unit:

- `release.yml` passes `actionlint`.
- In a fresh clone with `CI=true` and no `.env`: `pnpm install --frozen-lockfile`, `lint`,
  `typecheck` and `test` all pass.
- In the same clone, the exact build command produced `Boardly_1.2.3_aarch64.dmg` (about 2 minutes
  of Rust compile on an M-series Mac, cold). Inside it, `CFBundleShortVersionString` is `1.2.3`,
  `codesign --verify --deep --strict` passes, and the app launched and stayed up with a temporary
  `HOME`.

## Follow-ups / known gaps

- **The workflow has never run on GitHub.** The first run is its real test.
- **Only `mac_arm64` has been built.** `mac_x64`, `windows_x64` and `linux_x64` are configured from
  the Tauri docs and are unverified. Expect to fix something on first use, most likely the Linux
  package list.
- **Server integration tests skip in `prepare`.** They need `DATABASE_URL` and a Postgres service.
  Accepted because the release ships the desktop client, not the server.
- **Released builds point at `http://localhost:8788`,** from `apps/web/.env.production`. A fork with
  a hosted backend changes that one line.
- **Gatekeeper rejects the app** until it has a Developer ID signature and notarization. When the
  Apple licence in `CLAUDE.md` §7 is bought, replace `"-"` with the real identity.
- **The tag lands on `main`'s tip at release time.** A commit pushed to `main` during a run is
  tagged but not in the build. Same as nodl.
- **`GEMINI_API_KEY` is optional.** Without the repo secret, notes are the filtered commit subjects.
  With it, commit subjects are sent to Google's API.
