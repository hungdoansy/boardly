// Readable Markdown export. Produces an Obsidian-Kanban-compatible outline:
// `# Board`, then one `## Status` section per non-empty status (in workflow
// order) with `- [ ] card` / `- [x] card` items (checked = done/canceled). Card
// lines are the title only, so the output round-trips structurally back through
// `parseObsidian` (headings whose names match a status resolve to that status).
import { STATUS_META, STATUS_ORDER, type Status, isTerminalStatus } from "../status";
import type { BoardSnapshot } from "./snapshot";

const byOrd = <T extends { ord: string }>(a: T, b: T): number =>
  a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0;

export function exportMarkdown(snapshot: BoardSnapshot): string {
  const lines: string[] = [`# ${snapshot.board.title}`, ""];
  if (snapshot.board.description) {
    lines.push(snapshot.board.description, "");
  }

  const cardsByStatus = new Map<Status, typeof snapshot.cards>();
  for (const card of [...snapshot.cards].filter((c) => !c.archived).sort(byOrd)) {
    const list = cardsByStatus.get(card.status) ?? [];
    list.push(card);
    cardsByStatus.set(card.status, list);
  }

  for (const status of STATUS_ORDER) {
    const cards = cardsByStatus.get(status);
    if (!cards || cards.length === 0) continue;
    lines.push(`## ${STATUS_META[status].name}`, "");
    for (const card of cards) {
      const checked = isTerminalStatus(card.status);
      lines.push(`- [${checked ? "x" : " "}] ${card.title}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
