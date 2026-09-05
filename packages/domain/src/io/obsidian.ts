// Obsidian-Kanban markdown import. The Obsidian Kanban plugin stores a board as
// `## Column` headings with `- [ ] card` / `- [x] card` task items, an optional
// leading `# Title`, and a trailing `%% kanban:settings … %%` block we ignore.
// Since Unit 7 a card's placement is its `status`, so each heading resolves to a
// status: a heading whose name matches a known status (case-insensitive) adopts
// that status, otherwise cards under it default to Todo. A checked box overrides
// to Done. Produces a full BoardSnapshot with generated ids/ords.
import { newId } from "../ids";
import { keyBetween } from "../ordering";
import { DEFAULT_STATUS, STATUS_META, STATUS_VALUES, type Status } from "../status";
import { DEFAULT_ZOOM } from "../zoom";
import { type BoardSnapshot, ImportError, SNAPSHOT_VERSION } from "./snapshot";

const HEADING = /^#{1,6}\s+(.*)$/;
const TASK = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const CLIENT = "import";

/** Map a heading label to a status by matching its display name (case-insensitive). */
const STATUS_BY_NAME = new Map<string, Status>(
  STATUS_VALUES.map((s) => [STATUS_META[s].name.toLowerCase(), s]),
);

export function parseObsidian(text: string, boardTitle = "Imported board"): BoardSnapshot {
  const cards: BoardSnapshot["cards"] = [];

  let title = boardTitle;
  let currentStatus: Status | null = null;
  let sawSection = false;
  const cardOrdByStatus = new Map<Status, string | null>();
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
    if (task && currentStatus) {
      const done = task[1]!.toLowerCase() === "x";
      const status = done ? "done" : currentStatus;
      const prevOrd = cardOrdByStatus.get(status) ?? null;
      const ord = keyBetween(prevOrd, null, CLIENT);
      cardOrdByStatus.set(status, ord);
      cards.push({
        id: newId(),
        number: ++ticketNumber,
        title: task[2]!.trim(),
        description: "",
        ord,
        status,
        priority: 0,
        dueDate: null,
        labelIds: [],
        relatedIds: [],
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
      // Any other heading starts a status section.
      currentStatus = STATUS_BY_NAME.get(name.toLowerCase()) ?? DEFAULT_STATUS;
      sawSection = true;
    }
  }

  if (!sawSection) {
    throw new ImportError("No sections found — expected Obsidian-Kanban `## Column` headings.");
  }

  // Markdown is a structural outline: it carries no projects, no saved views and
  // no display preferences, so the v2 sections are present but empty/default
  // rather than absent (R5 — the format is not widened to carry them).
  return {
    version: SNAPSHOT_VERSION,
    board: {
      title,
      shortIdPrefix: "",
      badgeConfig: [],
      showEmptyColumns: true,
      zoom: DEFAULT_ZOOM,
    },
    projects: [],
    labels: [],
    views: [],
    cards,
  };
}
