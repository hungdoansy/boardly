---
title: The local-production runbook assumes toolchain prerequisites that a fresh machine lacks
date: 2026-09-04
problem_type: documentation_gap
module: docs/GUIDE-local-production.md, apps/desktop
severity: medium
tags: [docker, rust, tauri, onboarding, runbook, prerequisites, pnpm]
---

`docs/GUIDE-local-production.md` states, in its Prerequisites section, that Node/pnpm and Rust are
"already set up on this machine" — parenthetically, as if only Docker Desktop needed checking. On a
real run of that runbook, all three assumptions were false in different ways, and each failure
surfaces at a different step, so a reader following the guide top-to-bottom hits them one at a time.

**Docker Desktop installed ≠ `docker` runnable.** The app was present at `/Applications/Docker.app`
with current binaries (29.7.2), but `docker` was not on `PATH` and the daemon was not running. Docker
Desktop creates its `~/.docker/bin` symlinks during a first-launch step that had never completed, so
there was no `~/.docker/bin`, no `/usr/local/bin/docker`, and no `/opt/homebrew/bin/docker` — just
`command not found`. The real binaries live at `/Applications/Docker.app/Contents/Resources/bin/`
with the compose/buildx plugins alongside in `../cli-plugins/`. Prefix `PATH` with that directory
rather than concluding Docker is missing; then `open -a Docker` and poll `docker info` until it exits
0 (~20s here) before any compose command.

**Rust was absent entirely** — no `cargo`, no `~/.rustup` — so step 2's
`pnpm --filter @boardly/desktop tauri:build` cannot run at all on a machine that has only ever done
the Docker half. Installing it with `rustup ... --no-modify-path` (the right default: it leaves the
user's shell config alone) means `cargo` is still not on `PATH` afterwards, so the build command needs
`export PATH="$HOME/.cargo/bin:$PATH"` in the same shell. The guide should say the desktop build needs
a Rust install and roughly what it costs (toolchain download plus a cold release compile), because it
is by far the longest step and it is easy to read the current text as "just run this one command."

**`pnpm install` had never been run** in the checkout. It succeeds but ends with
`ERR_PNPM_IGNORED_BUILDS: sharp@0.34.5` — which reads like a failure and is not. `pnpm-workspace.yaml`
allow-lists only `esbuild` under `onlyBuiltDependencies`; `sharp` belongs to `packages/logo` and is
needed only by `pnpm logo:generate`, whose outputs are committed. The notice is expected and safe to
ignore for both the web bundle and the Tauri build — worth stating so nobody "fixes" it by approving
the build script.

The gotcha behind all three: the guide was written on the machine that already had everything, so its
prerequisites were recorded as observations rather than as steps. A runbook's prerequisites section
needs to be verifiable commands (`docker info`, `cargo --version`, `ls node_modules`) with the remedy
next to each, not an assertion about the author's machine state.
