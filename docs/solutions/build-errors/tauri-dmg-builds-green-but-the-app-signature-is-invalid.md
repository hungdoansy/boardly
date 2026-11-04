---
title: A Tauri DMG builds green but the .app inside fails signature verification
date: 2026-11-04
problem_type: build_error
module: .github/workflows, apps/desktop
severity: high
tags: [tauri, macos, codesign, ad-hoc, gatekeeper, release, ci]
---

`tauri build --bundles dmg` exits 0 and the app runs fine when built on the same Mac, so nothing
points at a problem. Mount the DMG and check it, though:

```bash
codesign --verify --deep /path/to/Boardly.app
# code has no resources but signature indicates they must be present
```

With no signing identity configured, `tauri.conf.json` gives the bundle no signature of its own. The
only signature is the one the Rust linker puts on the binary (`flags=adhoc,linker-signed`), and it
does not cover the `.app` resources. A local build never shows this because it carries no quarantine
flag. A copy downloaded from a GitHub Release does, and on Apple Silicon macOS is expected to report
it as damaged instead of offering to open it. That last step was not reproduced here. The failing
`codesign --verify` is what was observed.

The fix is `APPLE_SIGNING_IDENTITY: "-"` on the build step in `.github/workflows/release.yml`, which
makes Tauri ad-hoc sign the whole bundle. After it, `codesign --verify --deep --strict` passes and
the app still launches with the hardened runtime flag Tauri adds. It is set in CI only, so local
`tauri:build` is unchanged. Setting `signingIdentity` in `tauri.conf.json` would apply to local
builds too, and `CLAUDE.md` §7 reserves that field for a real, stable identity.

Ad-hoc is not Developer ID. `spctl -a -t exec` still rejects the app, so Gatekeeper blocks the first
launch and users clear quarantine with `xattr -dr com.apple.quarantine`. The gain is a valid bundle,
not a trusted one.

The gotcha: a passing build proves nothing about a distributed macOS app. Verify the artifact inside
the DMG with `codesign --verify --deep --strict`, not the build's exit code. Background in
`docs/units/UNIT-23-release-pipeline.md`.
