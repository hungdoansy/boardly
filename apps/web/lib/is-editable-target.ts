/**
 * Whether a keyboard event's target is a text-editing surface (so global/board
 * shortcuts must yield and let the keystroke type normally).
 *
 * Shared by every keydown handler in the app — the global shortcuts
 * (`useGlobalKeyboard`), the board roving nav (`useBoardKeyboardNav`), and the
 * leader-key mechanism (`useLeaderHotkeys`) — so the guard stays identical in
 * one place instead of drifting between copies.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  // `=== true` so the result is always a real boolean — `isContentEditable` can be
  // `undefined` in some DOM implementations (e.g. jsdom) for non-editable elements.
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true
  );
}
