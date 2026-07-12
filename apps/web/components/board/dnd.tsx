"use client";

import type { Card, Label, Project, Status } from "@boardly/domain";
import { execute, moveCard } from "@boardly/commands";
import { cardsInStatus } from "@boardly/sync";
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useState } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";
import { planMove } from "../../lib/dnd";
import { CardFace } from "../card/card";
import { BoardColumn } from "./column";

interface ActiveItem {
  id: string;
  title: string;
}

interface DragData {
  type: "card" | "column";
  /** The status column a card currently belongs to (for card drags). */
  status?: Status;
  title?: string;
}

export function BoardDndProvider({ children }: { children: ReactNode }) {
  const ctx = useBoardlyContext();
  const doc = ctx.getBoardDoc();
  const [active, setActive] = useState<ActiveItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space (not Enter) picks up / drops a card, leaving Enter to open it
      // and arrows to rove focus when no drag is active (see keyboard-nav).
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
      },
    }),
  );

  function onDragStart(event: DragStartEvent): void {
    const data = event.active.data.current as DragData | undefined;
    setActive({ id: String(event.active.id), title: data?.title ?? "" });
  }

  function onDragEnd(event: DragEndEvent): void {
    setActive(null);
    const { active: a, over } = event;
    if (!over) return;
    const activeId = String(a.id);
    const aData = a.data.current as DragData | undefined;
    const oData = over.data.current as DragData | undefined;

    // Columns are fixed (no reordering); only cards drag. Resolve the drop's
    // destination status and issue a single moveCard that both re-statuses and
    // slots the card (R10 — drag applies status immediately).
    const fromStatus = aData?.status;
    if (!fromStatus) return;
    const toStatus = (oData?.type === "column" ? oData.status : oData?.status) as
      | Status
      | undefined;
    if (!toStatus) return;
    const sameContainer = fromStatus === toStatus;
    const neighbors = planMove({
      currentOrder: cardsInStatus(doc, fromStatus).map((c) => c.id),
      destOrder: cardsInStatus(doc, toStatus).map((c) => c.id),
      activeId,
      overId: oData?.type === "card" ? String(over.id) : null,
      sameContainer,
    });
    if (neighbors) {
      execute(moveCard, ctx, {
        cardId: activeId,
        toStatus,
        afterId: neighbors.afterId,
        beforeId: neighbors.beforeId,
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay>
        {active ? (
          <div className="rounded-[var(--radius-md)] border border-line bg-elevated px-2.5 py-2 text-base text-fg shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
            {active.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function SortableCard({
  card,
  status,
  labels,
  project,
  config,
  onOpen,
  onArchive,
}: {
  card: Card;
  status: Status;
  labels?: Label[];
  project?: Project;
  config?: string[];
  onOpen: () => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", status, title: card.title } satisfies DragData,
  });
  return (
    <div
      ref={setNodeRef}
      data-nav="card"
      data-card-id={card.id}
      data-column-id={status}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      className="rounded-[var(--radius-md)] touch-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      {...attributes}
      {...listeners}
    >
      <CardFace
        card={card}
        labels={labels}
        project={project}
        config={config}
        onOpen={onOpen}
        onArchive={onArchive}
      />
    </div>
  );
}

/**
 * A fixed status column that is a drop target for cards (so dropping onto an
 * empty column still resolves a destination status). Columns never drag.
 */
export function StatusColumn({
  status,
  count,
  children,
}: {
  status: Status;
  count: number;
  children?: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: { type: "column", status } satisfies DragData,
  });
  return (
    <BoardColumn status={status} count={count} dndRef={setNodeRef}>
      {children}
    </BoardColumn>
  );
}
