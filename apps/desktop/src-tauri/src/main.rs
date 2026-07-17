// Boardly desktop shell (Tauri v2). Wraps the Next.js static export
// (`apps/web/out`) and wires the native capabilities the web bundle switches to
// when it detects Tauri (Unit 5.2): CORS-free HTTP (unfurl), notifications
// (due-date reminders), `boardly://` deep links, and refresh-token storage.
// (The auto-updater was removed for the laptop-only build — see
// docs/units/UNIT-8.1-local-production-packaging.md.)
//
// Refresh-token storage was originally the OS keychain (`keyring`). On an
// unsigned / ad-hoc-signed laptop build macOS re-prompts for Keychain access on
// every rebuild — the "always allow" ACL is bound to the code signature, which
// changes each build — so it never stops asking. For this personal,
// single-user, self-hosted app we drop the keychain and persist the token in a
// 0600 file under the app data dir instead: no prompt, ever. Trade-off: the
// token is no longer OS-encrypted (readable by any process running as the
// user). See docs/units/UNIT-P11-desktop-token-file-store.md.
//
// Prevent an extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

/// Account → secret map persisted as the token store's JSON body.
type SecretMap = BTreeMap<String, String>;

/// Path to the on-disk token store (`<app-data-dir>/auth-store.json`).
fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("auth-store.json"))
}

/// Load the token store; an absent file is an empty map (not an error).
fn read_store(app: &AppHandle) -> Result<SecretMap, String> {
    match fs::read(store_path(app)?) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(SecretMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Persist the token store, creating the data dir and restricting the file to
/// the owner (0600) on unix.
fn write_store(app: &AppHandle, map: &SecretMap) -> Result<(), String> {
    let path = store_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(map).map_err(|e| e.to_string())?;

    // Create the file owner-only (0600) *at creation* on unix, so there is no
    // window where the token is written to a group/world-readable file (the
    // TOCTOU gap a write-then-chmod leaves). Windows keeps the default per-user
    // profile ACL — tightening it further needs the Win32 security API, out of
    // scope for this laptop build.
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .map_err(|e| e.to_string())?;
        f.write_all(&json).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        fs::write(&path, &json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Store a secret (the refresh token) in the on-disk token store.
#[tauri::command]
fn token_set(app: AppHandle, account: String, secret: String) -> Result<(), String> {
    let mut map = read_store(&app)?;
    map.insert(account, secret);
    write_store(&app, &map)
}

/// Read a secret from the token store; `None` when there is no entry.
#[tauri::command]
fn token_get(app: AppHandle, account: String) -> Result<Option<String>, String> {
    Ok(read_store(&app)?.get(&account).cloned())
}

/// Delete a secret from the token store (idempotent — missing is success).
#[tauri::command]
fn token_delete(app: AppHandle, account: String) -> Result<(), String> {
    let mut map = read_store(&app)?;
    map.remove(&account);
    write_store(&app, &map)
}

fn main() {
    let mut builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin registered (desktop only) so a
    // second launch (e.g. via a `boardly://` link) focuses the running window —
    // showing it first in case the close button had hidden it (see below).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
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
        .on_window_event(|window, event| {
            // The red traffic-light close button (and any other window-close
            // request) would destroy our single window and, with no other window
            // left, terminate the app — so the close button quit like Cmd+Q.
            // Intercept it: hide the window and keep the app alive in the dock,
            // the standard macOS behavior. It is re-shown on a dock reopen (see
            // the run handler below) or a second launch (single-instance, above).
            // Quitting stays deliberate: Cmd+Q or the app menu's Quit item.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![token_set, token_get, token_delete])
        .build(tauri::generate_context!())
        .expect("error while building the Boardly desktop app")
        .run(|app, event| {
            // macOS: clicking the dock icon (a "reopen") after the close button
            // hid the window re-shows and focuses it, since there is no other
            // window for the OS to restore on its own.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
