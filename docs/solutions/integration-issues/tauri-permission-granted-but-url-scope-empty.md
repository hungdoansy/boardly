---
title: A Tauri command permission without its scope permission rejects every call
date: 2026-08-09
problem_type: integration_issue
module: apps/desktop/src-tauri, apps/web/lib
severity: high
tags:
  [
    tauri,
    capabilities,
    acl,
    permissions,
    scope,
    tauri-plugin-opener,
    external-links,
    silent-failure,
  ]
---

Clicking a link in the card drawer on the **desktop** app did nothing — for weeks. The only way to
reach the page was right-click → Copy Link (WKWebView's own menu, which never touches app code) and
paste into a browser.

## Root cause

`apps/desktop/src-tauri/capabilities/default.json` granted `"opener:allow-open-url"`. That reads like
"allow opening URLs". It is not: in Tauri v2 a plugin command can be guarded by **two independent
things** — the permission that enables the _command_, and a **scope** that says which
arguments are acceptable. `tauri-plugin-opener`'s `open_url` checks both:

```rust
// tauri-plugin-opener/src/commands.rs
if scope.is_url_allowed(&url, with.as_deref()) { … } else { Err(Error::ForbiddenUrl { … }) }
// scope.rs
pub fn is_url_allowed(&self, …) -> bool { … self.allowed.iter().any(|e| e.matches_url(url, with)) }
```

`any()` over an **empty** allow-list is `false`, so _every_ URL was rejected. The scope lives in a
**separate** permission — the plugin's `allow-default-urls`, which `opener:default` bundles in and
which is the only reason the documented `opener:default` setup works. Granting the bare
`allow-open-url` enables the command and supplies nothing for it to accept.

The fix is a scoped grant (deliberately narrower than `opener:default`, which would also hand the
webview `reveal_item_in_dir` plus `mailto:`/`tel:`):

```json
{ "identifier": "opener:allow-open-url", "allow": [{ "url": "http://*" }, { "url": "https://*" }] }
```

Those globs are the plugin's own. `glob::Pattern::matches` uses `require_literal_separator: false`,
so `*` spans the `/`s of a full URL — verified: `https://github.com/o/r/pull/7` ALLOW,
`slack://channel/123` and `javascript:alert(1)` DENY.

## Gotchas worth remembering

- **A granted capability is not a working capability.** `cargo check` passes, the plugin registers,
  the ACL resolves — and the command still rejects at call time, because scope is enforced per-call
  with the arguments. This shipped with "the Rust shell compiles and the capability is granted" as
  its verification and a written note that the runtime click was never exercised. That note was the
  bug. **A Tauri capability is unverified until the command is actually invoked from JS in a running
  window.**
- **Scope is only enforced on the IPC path.** Calling the same thing through the Rust API
  (`app.opener().open_url(…)`) skips `CommandScope` entirely, so a Rust-side smoke test would have
  "passed" while the real JS path stayed broken.
- **Inspect the resolved ACL, not the source JSON.** After a build, the effective grant is in
  `apps/desktop/src-tauri/target/*/build/boardly-*/out/capabilities.json`. An `allow: []` — or an
  identifier that appears as a bare string with no `allow` — is this bug's signature.
- **Never `catch {}` a native bridge call.** `apps/web/lib/open-external.ts` swallowed the
  `ForbiddenUrl` rejection, which is the whole reason a permanently-broken feature looked like a
  merely-dead click and survived so long. It now returns `boolean` and
  `apps/web/components/card/links.tsx` toasts on `false`.

## Related: the same class of bug on the web side

`react-markdown` renders a bare same-tab `<a href>`. In the Tauri webview that navigates **the entire
app** off the board (there is no tab to lose it in), and on web it navigates the board away. Any
component rendering user-authored links needs the deliberate external-open treatment —
`target="_blank"` + desktop interception — not just the hand-written link list. See
`apps/web/components/card/markdown-editor.tsx` (`components.a`) and `DESIGN.md` §8.
