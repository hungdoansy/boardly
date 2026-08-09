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
 * no-op. Never throws.
 *
 * Returns `false` when the URL was rejected or the desktop opener call failed,
 * so callers can surface the dead click instead of leaving the user staring at a
 * link that does nothing. (The desktop opener rejects on a missing/too-narrow
 * `opener:allow-open-url` URL scope — the exact bug that shipped with UNIT-9.4;
 * swallowing it silently is what let it go unnoticed.) The web path always
 * reports success: `window.open` with `noopener` returns `null` by spec even
 * when the tab opens, so its return value can't distinguish a blocked popup.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isSafeHttpUrl(url)) return false;
  if (isTauri()) {
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(url);
      return true;
    } catch {
      // Opener unavailable/denied — nothing else we can safely do on desktop.
      return false;
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
