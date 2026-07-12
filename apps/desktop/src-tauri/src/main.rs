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
        .invoke_handler(tauri::generate_handler![
            keyring_set,
            keyring_get,
            keyring_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Boardly desktop app");
}
