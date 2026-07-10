// Local notifications (Unit 5.2), e.g. due-date reminders (R9). Desktop uses
// Tauri's native notification plugin; web uses the Notifications API. Both gate
// on permission and never throw — a denied/absent permission just returns false.
import { isTauri } from "./platform";

export async function notify(title: string, body: string): Promise<boolean> {
  return isTauri() ? notifyTauri(title, body) : notifyWeb(title, body);
}

async function notifyTauri(title: string, body: string): Promise<boolean> {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (!granted) return false;
    n.sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}

async function notifyWeb(title: string, body: string): Promise<boolean> {
  try {
    if (typeof Notification === "undefined") return false;
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}
