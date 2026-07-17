# UNIT 11.1: Cmd+W and the close button hide the window (desktop)

- **Plan unit:** Unit 1 (`docs/plans/2026-07-14-002-feat-ui-docs-improvements-batch-plan.md`)
- **Status:** done (pending manual desktop verification — see below)
- **Requirements:** R1
- **Commit(s):** _this commit_

> **Superseded — read [Amendment 2](#amendment-2--cmdw-hides-the-window-like-the-close-button)
> first.** The "Cmd+W = synthetic Escape / ESC ladder" design described in
> _What changed_ / _Why_ / _How it works_ below was **removed** on user request:
> Cmd+W now hides the window exactly like the red close button. The web bridge
> (`apps/web/lib/desktop-menu.ts` + its test) is deleted. The sections below are
> kept for history; Amendment 2 is the current behavior.

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

## Amendment 2 — Cmd+W hides the window (like the close button)

The synthetic-Escape / ESC-ladder design above was **removed** on user request.
It made Cmd+W a no-op whenever nothing was open (no ticket/dialog/Settings/scope),
which read as "Cmd+W doesn't work" against normal macOS muscle memory. The user
wants Cmd+W to behave exactly like the red close button: hide the window, keep
the app in the dock.

Changes in `apps/desktop/src-tauri/src/main.rs`:

- The **Window** submenu's close item is now the **predefined `close_window()`**
  (`SubmenuBuilder::close_window()`), which keeps the standard Cmd+W accelerator
  and fires `WindowEvent::CloseRequested` — the same event the red traffic light
  raises. The `.on_window_event` handler from Amendment 1 already intercepts it
  (`api.prevent_close()` + `window.hide()`), so **Cmd+W and the close button now
  do the identical thing**: hide, never quit.
- The custom `close-view` `MenuItemBuilder`, the `.on_menu_event` handler, and the
  `menu-close-view` app event are **deleted** (with them the `Emitter` +
  `MenuItemBuilder` imports).

Web side — deleted as fully dead code:

- `apps/web/lib/desktop-menu.ts` and `apps/web/lib/desktop-menu.test.ts`.
- The `setupDesktopMenu()` import + effect in `apps/web/components/app/workspace-app.tsx`.

The in-app ESC ladder (`useGlobalKeyboard`) is untouched — Escape still closes the
open ticket/dialog/Settings/scope; it's just no longer reachable via Cmd+W.

Verify (manual, `pnpm --filter desktop tauri dev`): Cmd+W hides the window and the
app stays in the dock (identical to the red X); the dock icon brings it back with
state intact; Cmd+Q still quits; Cmd+C/V/X/A/Z still work in a text field.

## Follow-ups / known gaps

- Manual desktop verification (Amendment 2) is the remaining gate; the native menu / window behavior isn't automatable here (`cargo check` + web `typecheck` are green).
- Windows/Linux inherit the predefined Close Window accelerator; only macOS is a shipping target today.
