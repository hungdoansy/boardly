// Boardly desktop shell (Tauri v2). Wraps the Next.js static export
// (`apps/web/out`) in a native window. Unit 5.1 is the shell only — native
// capabilities (http/notification/deep-link/updater/keyring) land in Unit 5.2.
//
// Prevent an extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the Boardly desktop app");
}
