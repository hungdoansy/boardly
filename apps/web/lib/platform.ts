// Runtime platform detection. The same web bundle runs on the browser and,
// wrapped by Tauri (Unit 5.1), on the desktop. Tauri v2 injects
// `window.__TAURI_INTERNALS__` into the webview; a few modules branch on it to
// use native APIs (CORS-free http, OS keychain, native notifications).
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}
