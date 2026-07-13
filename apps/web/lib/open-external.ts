// Open an external URL from the same web bundle that runs both in the browser
// and, wrapped by Tauri (Unit 5.1), on the desktop. In a plain browser a normal
// `<a target="_blank">` works, but the Tauri webview does NOT hand a
// `target="_blank"` navigation to the OS browser — links there do nothing
// (UNIT-9.4). So on desktop we route through the opener plugin; on web we fall
// back to `window.open`. Same dynamic-import, never-throw pattern as `notify.ts`.
import { isSafeHttpUrl } from "@boardly/domain";

import { isTauri } from "./platform";

/**
 * Open `url` in the OS default browser (desktop) or a new tab (web). Only http(s)
 * URLs are opened (blocks `javascript:`, `slack://`, …); anything else is a
 * no-op. Never throws — a failed opener import/call is swallowed.
 */
export async function openExternal(url: string): Promise<void> {
  if (!isSafeHttpUrl(url)) return;
  if (isTauri()) {
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(url);
    } catch {
      // Opener unavailable/denied — nothing else we can safely do on desktop.
    }
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
