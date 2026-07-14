// Boardly desktop shell (Tauri v2). Wraps the Next.js static export
// (`apps/web/out`) and wires the native capabilities the web bundle switches to
// when it detects Tauri (Unit 5.2): CORS-free HTTP (unfurl), notifications
// (due-date reminders), `boardly://` deep links, and OS-keychain storage for
// the refresh token. (The auto-updater was removed for the laptop-only build —
// see docs/units/UNIT-8.1-local-production-packaging.md.)
//
// Prevent an extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::Entry;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

/// Keychain service name (namespaced to the app identifier).
const KEYRING_SERVICE: &str = "vn.moonbase.boardly";

/// Store a secret (the refresh token) in the OS keychain.
#[tauri::command]
fn keyring_set(account: String, secret: String) -> Result<(), String> {
    Entry::new(KEYRING_SERVICE, &account)
        .map_err(|e| e.to_string())?
        .set_password(&secret)
        .map_err(|e| e.to_string())
}

/// Read a secret from the OS keychain; `None` when there is no entry.
#[tauri::command]
fn keyring_get(account: String) -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete a secret from the OS keychain (idempotent — missing is success).
#[tauri::command]
fn keyring_delete(account: String) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn main() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered (desktop only) so a
    // second launch (e.g. via a `boardly://` link) focuses the running window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Tauri auto-generates a default macOS menu whose Window→Close binds
            // Cmd+W to `close_window` — with our single window that terminates the
            // app, so Cmd+W quits like Cmd+Q. Install a fully custom menu instead:
            // keep Quit on Cmd+Q, and rebind Cmd+W to a custom "Close View" item
            // that the web layer turns into an Escape (close the open ticket /
            // dialog / settings / project scope), never closing the window.
            //
            // Replacing the default menu drops the standard App + Edit submenus, so
            // re-add them or macOS text-editing shortcuts (Cmd+C/V/X/A/Z) break.
            let handle = app.handle();
            let app_menu = SubmenuBuilder::new(handle, "Boardly")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let close_view = MenuItemBuilder::with_id("close-view", "Close View")
                .accelerator("CmdOrCtrl+W")
                .build(handle)?;
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .item(&close_view)
                .build()?;
            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "close-view" {
                // Route to the web layer (see apps/web/lib/desktop-menu.ts), which
                // dispatches a synthetic Escape so the existing ESC ladder closes
                // the current view without touching the window.
                let _ = app.emit("menu-close-view", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            keyring_set,
            keyring_get,
            keyring_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Boardly desktop app");
}
