"use client";

import { useCardActions, useCardsInColumn } from "../../lib/use-board";
import { CardFace } from "../card/card";
import { CardComposer } from "../card/card-composer";

export function ColumnCards({ boardId, columnId }: { boardId: string; columnId: string }) {
  const cards = useCardsInColumn(boardId, columnId);
  const actions = useCardActions(boardId);

  return (
    <>
      {cards.map((card) => (
        <CardFace
          key={card.id}
          card={card}
          onRename={(title) => actions.rename(card.id, title)}
          onArchive={() => actions.archive(card.id)}
        />
      ))}
      <CardComposer onAdd={(title) => actions.create(columnId, title)} />
    </>
  );
}
