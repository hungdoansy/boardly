// Copy text to the clipboard, best-effort. Uses the async Clipboard API when
// available (works in the browser and the Tauri webview); returns false and
// never throws when it is absent or denied, so callers can decide whether to
// confirm. Mirrors the never-throw shape of `notify.ts`.

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
