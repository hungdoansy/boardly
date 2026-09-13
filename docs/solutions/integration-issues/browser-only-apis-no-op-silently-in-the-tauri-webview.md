---
title: Browser-only APIs no-op silently in the Tauri webview
date: 2026-09-13
problem_type: integration_issue
module: apps/web, apps/desktop
severity: high
tags: [tauri, webview, desktop, download, file-save, dead-click, platform-branch]
---

The Tauri webview is not a browser. It renders the same bundle, but a handful of APIs that
are _the_ standard way to do something on the web are **absent or inert** there — and they
do not throw. The call returns normally, nothing happens, and no error reaches the console.
A feature built on one of them is permanently broken on the desktop while looking perfectly
healthy in every test and in `localhost:3000`.

This has now happened twice in this repo, with the same signature both times:

| Unit     | API                                       | Symptom                                 |
| -------- | ----------------------------------------- | --------------------------------------- |
| UNIT-9.4 | `<a target="_blank">` / `window.open`     | External links did nothing when clicked |
| UNIT-22  | blob URL + synthetic `<a download>` click | Board export did nothing when clicked   |

**The download case specifically:** the webview has no download manager, so
`a.download = name; a.click()` is silently discarded. The blob is created, the anchor is
appended and clicked and removed, `URL.revokeObjectURL` runs — every line executes, and no
file is ever written.

## Why it keeps getting through

1. **It works in dev.** The Next.js dev server on `:3000` is a real browser. Anyone
   testing there sees the feature work.
2. **It works in tests.** jsdom implements the DOM side happily. And in the export case
   there was **zero test coverage on the export path at all** — a unit test would not have
   caught it anyway, because jsdom is also not the webview.
3. **The catch block hides it.** Where a native fallback _is_ attempted, a bare
   `catch {}` turns a hard failure into the same silent nothing.

## The pattern that fixes it

Put the platform branch behind one helper in `apps/web/lib/` (`open-external.ts`,
`save-file.ts`), branch on `isTauri()` once, dynamic-`import()` the plugin **inside** the
desktop branch so the web build never bundles it — and **return an outcome the caller
surfaces**. Never `catch {}` a native bridge call.

Return a _three-state_ outcome where the native dialog can be dismissed:

```ts
type SaveOutcome =
  { status: "saved"; path?: string } | { status: "cancelled" } | { status: "failed" };
```

Cancelling is a choice, not an error. A boolean forces a dismissed dialog to be reported as
a failure, which trains the user to ignore the message that matters.

## How to actually verify it

**Running the app in a browser proves nothing about the desktop.** Neither does `cargo
check`, nor a Rust-side smoke test — for plugin calls, scope is enforced only on the IPC
path. The only verification that counts is clicking the thing in a `tauri dev` window.

Companion doc for the permission half of this trap (a granted permission carries no scope
of its own): `tauri-permission-granted-but-url-scope-empty.md`.
