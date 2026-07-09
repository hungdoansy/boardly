// Pure drop → ord computation for drag-and-drop. Kept free of dnd-kit/React so
// it is unit-testable; the interaction itself is verified in Playwright.
//
// A move is expressed as the moved item's neighbors in the POST-move ordered
// list; the command layer turns (afterId, beforeId) into a single fractional
// `ord` write. `afterId` is the item immediately before the moved item,
// `beforeId` the one immediately after (either null at a list boundary).

export interface DropNeighbors {
  afterId: string | null;
  beforeId: string | null;
}

/** Neighbors of `activeId` within an ordered id list. */
export function neighborsInList(orderedIds: string[], activeId: string): DropNeighbors {
  const idx = orderedIds.indexOf(activeId);
  if (idx === -1) return { afterId: null, beforeId: orderedIds[0] ?? null };
  return {
    afterId: idx > 0 ? (orderedIds[idx - 1] ?? null) : null,
    beforeId: idx < orderedIds.length - 1 ? (orderedIds[idx + 1] ?? null) : null,
  };
}

export function sameNeighbors(a: DropNeighbors, b: DropNeighbors): boolean {
  return a.afterId === b.afterId && a.beforeId === b.beforeId;
}

/**
 * The destination order after dropping `activeId` at `overId`'s position.
 * - `sameContainer`: `order` already contains `activeId` (a within-list reorder).
 * - cross-container: `order` is the destination list WITHOUT `activeId`; it is
 *   inserted before `overId`, or appended when `overId` is null (empty column /
 *   dropped on the column itself).
 */
export function reorder(
  order: string[],
  activeId: string,
  overId: string | null,
  opts: { sameContainer: boolean },
): string[] {
  if (opts.sameContainer) {
    const from = order.indexOf(activeId);
    const to = overId ? order.indexOf(overId) : order.length - 1;
    if (from === -1 || to === -1) return order;
    const copy = [...order];
    copy.splice(from, 1);
    copy.splice(to, 0, activeId);
    return copy;
  }
  const without = order.filter((id) => id !== activeId);
  const overIdx = overId ? without.indexOf(overId) : -1;
  if (overIdx === -1) return [...without, activeId];
  return [...without.slice(0, overIdx), activeId, ...without.slice(overIdx)];
}

/**
 * Plan a card/column move: returns the post-move neighbors, or `null` when the
 * item would land where it already is (avoids spurious `ord` churn).
 */
export function planMove(params: {
  currentOrder: string[]; // source order, includes activeId
  destOrder: string[]; // destination order (includes activeId iff same container)
  activeId: string;
  overId: string | null;
  sameContainer: boolean;
}): DropNeighbors | null {
  const next = reorder(params.destOrder, params.activeId, params.overId, {
    sameContainer: params.sameContainer,
  });
  const neighbors = neighborsInList(next, params.activeId);
  if (params.sameContainer) {
    const current = neighborsInList(params.currentOrder, params.activeId);
    if (sameNeighbors(current, neighbors)) return null;
  }
  return neighbors;
}
