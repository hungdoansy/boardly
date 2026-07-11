// Obsidian-Kanban markdown import. The Obsidian Kanban plugin stores a board as
// `## Column` headings with `- [ ] card` / `- [x] card` task items, an optional
// leading `# Title`, and a trailing `%% kanban:settings … %%` block we ignore.
// Cards land in the column of the most recent heading; a checked box maps to a
// terminal (done) status. Produces a full BoardSnapshot with generated ids/ords.
import { newId } from "../ids";
import { keyBetween } from "../ordering";
import { DEFAULT_STATUS, Status } from "../status";
import { type BoardSnapshot, ImportError, SNAPSHOT_VERSION } from "./snapshot";

const HEADING = /^#{1,6}\s+(.*)$/;
const TASK = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const CLIENT = "import";

export function parseObsidian(text: string, boardTitle = "Imported board"): BoardSnapshot {
  const columns: BoardSnapshot["columns"] = [];
  const cards: BoardSnapshot["cards"] = [];

  let title = boardTitle;
  let currentColumnId: string | null = null;
  let colOrd: string | null = null;
  const cardOrdByColumn = new Map<string, string | null>();
  let inSettings = false;
  let sawH1 = false;
  let ticketNumber = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Skip Obsidian `%% … %%` settings blocks (single- or multi-line).
    if (line.startsWith("%%")) {
      inSettings = !line.endsWith("%%") || line === "%%";
      continue;
    }
    if (inSettings) {
      if (line.endsWith("%%")) inSettings = false;
      continue;
    }
    if (!line) continue;

    const task = TASK.exec(rawLine);
    if (task && currentColumnId) {
      const done = task[1]!.toLowerCase() === "x";
      const prevOrd = cardOrdByColumn.get(currentColumnId) ?? null;
      const ord = keyBetween(prevOrd, null, CLIENT);
      cardOrdByColumn.set(currentColumnId, ord);
      cards.push({
        id: newId(),
        number: ++ticketNumber,
        title: task[2]!.trim(),
        description: "",
        columnId: currentColumnId,
        ord,
        status: done ? Status.Done : DEFAULT_STATUS,
        priority: 0,
        severity: null,
        dueDate: null,
        labelIds: [],
        checklist: [],
        links: [],
        archived: false,
        createdAt: 0,
        updatedAt: 0,
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = line.length - line.replace(/^#+/, "").length;
      const name = heading[1]!.trim();
      if (level === 1 && !sawH1) {
        title = name || boardTitle;
        sawH1 = true;
        continue;
      }
      // Any other heading starts a column.
      colOrd = keyBetween(colOrd, null, CLIENT);
      const id = newId();
      columns.push({ id, title: name || "Untitled", ord: colOrd, archived: false });
      currentColumnId = id;
    }
  }

  if (columns.length === 0) {
    throw new ImportError("No columns found — expected Obsidian-Kanban `## Column` headings.");
  }

  return {
    version: SNAPSHOT_VERSION,
    board: { title, shortIdPrefix: "", badgeConfig: [] },
    labels: [],
    columns,
    cards,
  };
}
