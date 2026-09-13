// Write a generated file to disk from the same web bundle that runs both in the
// browser and, wrapped by Tauri (Unit 5.2), on the desktop. In a plain browser a
// blob URL plus a synthetic `<a download>` click hands the file to the browser's
// download manager, but the Tauri webview HAS NO download manager — the anchor
// click is silently ignored, so export was a dead click on the desktop for the
// whole life of the feature (UNIT-22). So on desktop we ask for a real save
// location through the dialog plugin and write it with the fs plugin; on web we
// keep the anchor. Same dynamic-import, never-throw pattern as `open-external.ts`.
import { isTauri } from "./platform";

/**
 * What happened to a save. Three outcomes rather than a boolean because
 * **cancelling is not failing**: a person who dismisses the native save sheet
 * chose not to save and must not be shown an error. Collapsing the two is how a
 * deliberate cancel ends up looking like a bug.
 */
export type SaveOutcome =
  | {
      status: "saved";
      /** Absolute path — desktop only; the browser never reveals it. */ path?: string;
    }
  | { status: "cancelled" }
  | { status: "failed" };

/** Hand `text` to the browser's download manager under `filename`. */
function downloadInBrowser(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Save `text` as `filename`. On desktop this opens the OS save sheet and writes
 * the chosen path; on web it downloads. Never throws.
 *
 * Returns the outcome so the caller can surface a failure instead of leaving the
 * user staring at a menu that closed and did nothing. (The desktop path fails on
 * a missing or too-narrow `fs:allow-write-text-file` path scope — a granted
 * permission carries no scope of its own, the exact trap UNIT-9.4 hit with the
 * opener plugin; swallowing it silently is what let that one go unnoticed.)
 */
export async function saveFile(
  filename: string,
  text: string,
  mime = "application/json",
): Promise<SaveOutcome> {
  if (isTauri()) {
    try {
      const [dialog, fs] = await Promise.all([
        import("@tauri-apps/plugin-dialog"),
        import("@tauri-apps/plugin-fs"),
      ]);
      const extension = filename.split(".").pop() ?? "json";
      const path = await dialog.save({
        defaultPath: filename,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      // The plugin returns null when the sheet was dismissed — a choice, not an error.
      if (path === null) return { status: "cancelled" };
      await fs.writeTextFile(path, text);
      return { status: "saved", path };
    } catch {
      // Dialog/fs unavailable or the write was denied by scope — nothing else we
      // can safely do on desktop, but the caller must be told.
      return { status: "failed" };
    }
  }
  try {
    downloadInBrowser(filename, text, mime);
    return { status: "saved" };
  } catch {
    return { status: "failed" };
  }
}
