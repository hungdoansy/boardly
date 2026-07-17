# UNIT 11.1: Cmd+W closes the current view (desktop menu + web bridge)

- **Plan unit:** Unit 1 (`docs/plans/2026-07-14-002-feat-ui-docs-improvements-batch-plan.md`)
- **Status:** done (pending manual desktop verification — see below)
- **Requirements:** R1
- **Commit(s):** _this commit_

## What changed

- `apps/desktop/src-tauri/src/main.rs` — install a **custom Tauri v2 menu** in `.setup()`:
  - App submenu ("Boardly") with About / Services / Hide / Hide Others / Show All / **Quit** (Cmd+Q, unchanged).
  - **Edit** submenu (Undo / Redo / Cut / Copy / Paste / Select All) — re-added so macOS text-editing shortcuts keep working.
  - **Window** submenu with Minimize and a custom **"Close View"** item bound to `CmdOrCtrl+W`.
  - `.on_menu_event(...)` emits `menu-close-view` when "Close View" is selected. (`use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder}; use tauri::Emitter;`)
- `apps/web/lib/desktop-menu.ts` (new) — `setupDesktopMenu()`: `isTauri()`-guarded; dynamically imports `@tauri-apps/api/event`, listens for `menu-close-view`, and dispatches a synthetic `Escape` keydown on `document`. Returns an unlisten cleanup. No-op on web.
- `apps/web/components/app/workspace-app.tsx` — an effect in `Shell` calls `setupDesktopMenu()` and cleans up on unmount (guards against the async resolving post-unmount).
- `apps/web/lib/desktop-menu.test.ts` (new) — no-op on web; dispatches Escape on the menu event and unsubscribes on cleanup.

## Why (decisions)

- **The bug:** the desktop app defined no menu, so Tauri v2's default macOS menu bound Cmd+W to `close_window`; with a single window that terminates the process, so Cmd+W quit the app like Cmd+Q.
- **Cmd+W = programmatic Escape.** Boardly already has a tested ESC ladder (`useGlobalKeyboard` in `workspace-app.tsx`) that closes the current view layer-by-layer: the open ticket Sheet / command palette / search (Radix overlays that self-close on Escape via a document-level listener), then Settings, then reset project scope to All, then no-op. Dispatching a synthetic Escape reuses **all** of that with no parallel close-stack to keep in sync — Cmd+W and Escape are guaranteed identical.
- **Native-menu → app event → web listener** is required because a web `keydown` for Cmd+W never reaches the webview (the native accelerator intercepts it), and both keyboard hooks bail on modifier chords.
- **Re-add the App + Edit submenus.** Replacing the auto-generated menu otherwise drops the macOS Edit menu, breaking Cmd+C/V/X/A/Z in the webview — the main correctness trap, called out inline.
- **Event name `menu-close-view`** (no `://`) to stay within Tauri's event-name charset.
- **Dynamic import of `@tauri-apps/api/event`** inside the `isTauri()` branch keeps Tauri APIs out of the static web bundle (verified: `pnpm --filter @boardly/web build` succeeds).
- Nothing-open behavior: Cmd+W falls through the ladder to `setSelectedProject(null)` (reset to All), then no-ops — it never minimizes, hides, or quits (Scope Boundary).

## How it works

1. macOS Cmd+W triggers the custom "Close View" menu item (id `close-view`).
2. `.on_menu_event` emits `menu-close-view` to the webview.
3. `setupDesktopMenu()`'s listener dispatches `new KeyboardEvent("keydown", { key: "Escape", bubbles: true })` on `document`.
4. Radix's document-level escape handling closes the topmost open overlay; if none, `useGlobalKeyboard`'s Escape branch steps the ladder (Settings → project scope → no-op).
5. Cmd+Q still maps to the predefined Quit item.

## Design (UI units)

- Native OS menu behavior; no in-app visual surface, so no `DESIGN.md` change. Respects the existing ESC-ladder interaction model documented for UNIT-7.10.

## How to test / verify

- **Automated (done):**
  - `apps/web/lib/desktop-menu.test.ts` (2 passing): web no-op path; synthetic-Escape dispatch + unlisten.
  - `cargo check --bin boardly` — the Rust menu code compiles.
  - `pnpm --filter @boardly/web typecheck` and `build` succeed (no Tauri API in the static bundle); eslint/prettier clean.
- **Manual (required — native menus can't be driven by web e2e):** in `pnpm --filter desktop tauri dev` (or the packaged app), confirm:
  - With a ticket open, Cmd+W closes the ticket and the app stays open.
  - In Settings, Cmd+W exits Settings; with a project scope selected, Cmd+W resets to All; with nothing open, Cmd+W does nothing (window stays).
  - Cmd+Q quits.
  - Cmd+C / Cmd+V / Cmd+A / Cmd+Z work in a text field (Edit menu re-added).

## Amendment — window close button keeps the app running (macOS)

The Cmd+W work above deliberately left the window's **close button** (the red
traffic light) alone, and it had the same root problem the menu did: closing the
only window destroys it and, with no window left, macOS terminates the app — so
the red X quit Boardly like Cmd+Q. Fixed in `apps/desktop/src-tauri/src/main.rs`:

- **`.on_window_event`** intercepts `WindowEvent::CloseRequested`, calls
  `window.hide()` then `api.prevent_close()` — the window disappears but the
  process keeps running in the dock.
- The builder now `.build(generate_context!())?.run(|app, event| …)` (instead of
  `.run(generate_context!())`) so it can handle **`RunEvent::Reopen`** (macOS
  only, `#[cfg(target_os = "macos")]`): clicking the dock icon re-`show()`s and
  focuses the hidden `main` window. Without this the app would be stuck alive
  with no way back to a window.
- The **single-instance** callback (previously a no-op) now also `show()`s +
  focuses the `main` window, so a `boardly://` deep link surfaces the window when
  it was hidden by the close button.
- **Quitting stays deliberate:** Cmd+Q and the app menu's Quit item still exit;
  only the window-close path changed.

Verify (manual, `pnpm --filter desktop tauri dev`): red X hides the window and
the app stays in the dock; clicking the dock icon brings the window back with
state intact; Cmd+Q still quits.

## Follow-ups / known gaps

- Manual desktop verification above is the remaining gate (the code compiles and the web bridge is unit-tested; behavior against the real macOS menu is not automatable here).
- If a synthetic Escape ever fails to drive a specific Radix layer, the fallback is an imperative close routine that clears `openCardId`/palette/search state directly (not needed given Radix's document-level escape listener).
- Windows/Linux use the same `CmdOrCtrl+W` accelerator; only macOS is a shipping target today.
