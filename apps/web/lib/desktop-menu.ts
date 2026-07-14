import { isTauri } from "./platform";

/**
 * Wire the desktop app's native menu into the web layer.
 *
 * The only item today is "Close View" (Cmd+W), defined in the Tauri menu
 * (`apps/desktop/src-tauri/src/main.rs`). Rather than duplicate the close logic,
 * we turn the menu event into a synthetic Escape keydown on `document` — Radix
 * overlays listen for Escape at the document level and the app's ESC ladder
 * (see `workspace-app.tsx`) already closes the current view layer-by-layer
 * (open ticket/dialog/palette → Settings → project scope → no-op). So Cmd+W
 * behaves exactly like Escape and never closes the window.
 *
 * No-op on web (returns immediately and imports no Tauri API, keeping the static
 * export clean). Returns a cleanup function that removes the native listener.
 */
export async function setupDesktopMenu(): Promise<() => void> {
  if (!isTauri()) return () => {};
  // Dynamic import so `@tauri-apps/api/event` never enters the web bundle.
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen("menu-close-view", () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  return unlisten;
}
