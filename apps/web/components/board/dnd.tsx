"use client";

import type { Card, Column, Label } from "@boardly/domain";
import { execute, moveCard, moveColumn } from "@boardly/commands";
import { cardsInColumn, liveColumns } from "@boardly/sync";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  closestCorners,
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
  type: "card" | "column";
  title: string;
}

interface DragData {
  type: "card" | "column";
  columnId?: string;
  title?: string;
}

export function BoardDndProvider({ boardId, children }: { boardId: string; children: ReactNode }) {
  const ctx = useBoardlyContext();
  const doc = ctx.getBoardDoc(boardId);
  const [active, setActive] = useState<ActiveItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(event: DragStartEvent): void {
    const data = event.active.data.current as DragData | undefined;
    setActive({
      id: String(event.active.id),
      type: data?.type ?? "card",
      title: data?.title ?? "",
    });
  }

  function onDragEnd(event: DragEndEvent): void {
    setActive(null);
    const { active: a, over } = event;
    if (!over) return;
    const activeId = String(a.id);
    const aData = a.data.current as DragData | undefined;
    const oData = over.data.current as DragData | undefined;

    if (aData?.type === "column") {
      if (String(over.id) === activeId) return;
      const colIds = liveColumns(doc).map((c) => c.id);
      const neighbors = planMove({
        currentOrder: colIds,
        destOrder: colIds,
        activeId,
        overId: String(over.id),
        sameContainer: true,
      });
      if (neighbors) {
        execute(moveColumn, ctx, {
          boardId,
          columnId: activeId,
          afterId: neighbors.afterId,
          beforeId: neighbors.beforeId,
        });
      }
      return;
    }

    const fromColumnId = aData?.columnId;
    if (!fromColumnId) return;
    const toColumnId = oData?.type === "column" ? String(over.id) : oData?.columnId;
    if (!toColumnId) return;
    const sameContainer = fromColumnId === toColumnId;
    const neighbors = planMove({
      currentOrder: cardsInColumn(doc, fromColumnId).map((c) => c.id),
      destOrder: cardsInColumn(doc, toColumnId).map((c) => c.id),
      activeId,
      overId: oData?.type === "card" ? String(over.id) : null,
      sameContainer,
    });
    if (neighbors) {
      execute(moveCard, ctx, {
        boardId,
        cardId: activeId,
        toColumnId,
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
  columnId,
  labels,
  onOpen,
  onArchive,
}: {
  card: Card;
  columnId: string;
  labels?: Label[];
  onOpen: () => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId, title: card.title } satisfies DragData,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      className="touch-none"
      {...attributes}
      {...listeners}
    >
      <CardFace card={card} labels={labels} onOpen={onOpen} onArchive={onArchive} />
    </div>
  );
}

export function SortableColumn({
  column,
  count,
  onRename,
  onDelete,
  children,
}: {
  column: Column;
  count: number;
  onRename: (title: string) => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: "column", title: column.title } satisfies DragData,
  });
  return (
    <BoardColumn
      column={column}
      count={count}
      onRename={onRename}
      onDelete={onDelete}
      dndRef={setNodeRef}
      dndStyle={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
      dragHandle={{ ref: setActivatorNodeRef, attributes, listeners }}
    >
      {children}
    </BoardColumn>
  );
}
