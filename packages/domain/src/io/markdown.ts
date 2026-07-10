// Readable Markdown export. Produces an Obsidian-Kanban-compatible outline:
// `# Board`, then `## Column` sections with `- [ ] card` / `- [x] card` items
// (checked = done/canceled/archived). Card lines are the title only, so the
// output round-trips structurally back through `parseObsidian`.
import { isTerminalStatus } from "../status";
import type { BoardSnapshot } from "./snapshot";

const byOrd = <T extends { ord: string }>(a: T, b: T): number =>
  a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0;

export function exportMarkdown(snapshot: BoardSnapshot): string {
  const lines: string[] = [`# ${snapshot.board.title}`, ""];
  if (snapshot.board.description) {
    lines.push(snapshot.board.description, "");
  }

  const columns = [...snapshot.columns].filter((c) => !c.archived).sort(byOrd);
  const cardsByColumn = new Map<string, typeof snapshot.cards>();
  for (const card of [...snapshot.cards].filter((c) => !c.archived).sort(byOrd)) {
    const list = cardsByColumn.get(card.columnId) ?? [];
    list.push(card);
    cardsByColumn.set(card.columnId, list);
  }

  for (const column of columns) {
    lines.push(`## ${column.title}`, "");
    for (const card of cardsByColumn.get(column.id) ?? []) {
      const checked = isTerminalStatus(card.status);
      lines.push(`- [${checked ? "x" : " "}] ${card.title}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
