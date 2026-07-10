// Pure due-date presentation helpers. `now` is injected so the label/tone are
// deterministically testable. A date-only due (hasTime=false) is "due that
// day" — only overdue once the day has passed; a timed due is overdue at its
// exact moment.
import type { DueDate } from "./types";

export type DueTone = "overdue" | "soon" | "normal";

export interface DueDisplay {
  label: string;
  tone: DueTone;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const minutes = d.getMinutes();
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  let hours = d.getHours() % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

/** `Jul 12` (or `Jul 12, 3:00 PM` when timed). */
export function formatDueDate(due: DueDate): string {
  const d = new Date(due.at);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return due.hasTime ? `${base}, ${formatTime(due.at)}` : base;
}

/** Compact chip label + color tone relative to `now`. */
export function describeDueDate(due: DueDate, now: number): DueDisplay {
  const overdue = due.hasTime ? due.at < now : dayStart(due.at) < dayStart(now);
  const daysUntil = Math.round((dayStart(due.at) - dayStart(now)) / 86_400_000);

  let label: string;
  if (overdue) {
    label = "Overdue";
  } else if (daysUntil === 0) {
    label = due.hasTime ? formatTime(due.at) : "Today";
  } else if (daysUntil === 1) {
    label = "Tomorrow";
  } else if (daysUntil <= 6) {
    label = `${daysUntil}d`;
  } else {
    label = formatDueDate(due);
  }

  const tone: DueTone = overdue ? "overdue" : daysUntil <= 2 ? "soon" : "normal";
  return { label, tone };
}

/**
 * Compact relative timestamp for activity/history feeds: "now", "5m", "3h",
 * "2d", then an absolute `Jul 12` (or `Jul 12, 2025` in a prior year). `now` is
 * injected so it is deterministically testable.
 */
export function formatRelativeTime(at: number, now: number): string {
  const diff = now - at;
  if (diff < 45_000) return "now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(diff / 86_400_000);
  if (days < 7) return `${days}d`;
  const d = new Date(at);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}
