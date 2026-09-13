// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Status } from "@boardly/domain";
import { addCard, addLabel, cardsInStatus, initBoard, setCardTitle } from "@boardly/sync";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveFileMock, toastMock } = vi.hoisted(() => ({
  saveFileMock: vi.fn(),
  toastMock: vi.fn(),
}));
vi.mock("../../lib/save-file", () => ({ saveFile: saveFileMock }));
vi.mock("@boardly/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@boardly/ui")>()),
  toast: toastMock,
}));

import { BoardlyProvider } from "../../lib/boardly-context";
import { ImportExportMenu } from "./import-export";

const NOW = 1_700_000_000_000;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(seed?: (ctx: MemoryContext) => void): MemoryContext {
  const ctx = createMemoryContext({ now: () => NOW + 5000 });
  initBoard(ctx.getBoardDoc(), { title: "Roadmap", now: NOW });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <ImportExportMenu boardTitle="Roadmap" />
    </BoardlyProvider>,
  );
  return ctx;
}

const twoCards = (ctx: MemoryContext): void => {
  const doc = ctx.getBoardDoc();
  addCard(doc, { id: "c1", status: Status.Todo, title: "Board version", now: NOW, clientId: "1" });
  addCard(doc, { id: "c2", status: Status.Todo, title: "Board only", now: NOW, clientId: "1" });
  addLabel(doc, { id: "l1", name: "bug", color: "#eb5757", now: NOW, clientId: "1" });
};

const fileJson = (cards: unknown[], title = "File board"): string =>
  JSON.stringify({ version: 2, board: { title }, cards });

/** The Popover trigger is a plain toggle button, unlike the dropdown triggers elsewhere. */
function openMenu(): void {
  fireEvent.click(screen.getByRole("button", { name: /export/i }));
}

/**
 * Drive the hidden file input the way the browser does. `File.text()` is stubbed
 * because jsdom's Blob text reading is not guaranteed across versions, and the
 * component awaits it before anything else happens.
 */
async function choose(name: string, content: string): Promise<void> {
  openMenu();
  const input = await waitFor(() => {
    const el = document.querySelector('input[type="file"]');
    if (!el) throw new Error("file input not rendered");
    return el as HTMLInputElement;
  });
  const file = new File([content], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => content });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

const modeButton = (label: RegExp): HTMLElement => screen.getByRole("button", { name: label });

describe("import — choosing a mode (R4, R9, R24)", () => {
  it("offers all three modes, each with its effect on existing content", async () => {
    setup(twoCards);
    await choose("board.json", fileJson([{ id: "f1", title: "From the file", status: "todo" }]));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("File board");
    // The file's contents are known before any mode is offered (R16).
    expect(dialog).toHaveTextContent("1 card, 0 projects, 0 labels");

    for (const [label, effect] of [
      [/^Merge/, /Never deletes/],
      [/^Add as copy/, /new ids/],
      [/^Replace/, /Deletes everything/],
    ] as const) {
      const button = modeButton(label);
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent(effect);
    }
  });

  it("rejects a markdown file rather than offering modes for it (UNIT-22)", async () => {
    setup(twoCards);
    // Markdown import was removed with the Obsidian parser: JSON is the only
    // format. A .md file is now just an unparseable file, not a second path.
    await choose("board.md", "## Todo\n- [ ] A\n- [ ] B");

    // The popover itself carries role="dialog", so assert on the mode picker's
    // own heading rather than the role.
    expect(screen.queryByText("Import into this board")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/not valid JSON/i);
  });

  it("shows the inline alert and no mode picker for a malformed file", async () => {
    setup(twoCards);
    await choose("broken.json", '{"board":{}}');

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The popover itself is a Radix dialog, so assert on the picker's own title.
    expect(screen.queryByText("Import into this board")).not.toBeInTheDocument();
  });
});

describe("import — Replace confirmation (R16, AE4)", () => {
  it("names both sides and leaves the board untouched on cancel", async () => {
    const ctx = setup(twoCards);
    await choose("board.json", fileJson([{ id: "f1", title: "From the file", status: "todo" }]));
    fireEvent.click(modeButton(/^Replace/));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Replace this board?");
    expect(dialog).toHaveTextContent("2 cards, 0 projects, 1 label"); // being removed
    expect(dialog).toHaveTextContent("1 card, 0 projects, 0 labels"); // arriving
    expect(dialog).toHaveTextContent("File board");
    expect(dialog).toHaveTextContent(/every signed-in device/i);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cardsInStatus(ctx.getBoardDoc(), Status.Todo).map((c) => c.title)).toEqual([
      "Board version",
      "Board only",
    ]);
    // Cancelling returns to the picker rather than closing the whole flow.
    expect(await screen.findByText("Import into this board")).toBeInTheDocument();
  });

  it("runs the import when confirmed", async () => {
    const ctx = setup(twoCards);
    await choose("board.json", fileJson([{ id: "f1", title: "From the file", status: "todo" }]));
    fireEvent.click(modeButton(/^Replace/));
    fireEvent.click(await screen.findByRole("button", { name: /Replace board/ }));

    expect(cardsInStatus(ctx.getBoardDoc(), Status.Todo).map((c) => c.title)).toEqual([
      "From the file",
    ]);
    expect(await screen.findByText("Import finished")).toBeInTheDocument();
  });
});

describe("import — result panel (R17, KTD6)", () => {
  it("merges with no confirmation step and reports the counts", async () => {
    const ctx = setup(twoCards);
    await choose("board.json", fileJson([{ id: "f1", title: "From the file", status: "todo" }]));
    fireEvent.click(modeButton(/^Merge/));

    // Straight to the result — merge is not gated.
    expect(await screen.findByText("Import finished")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cards: 1 added");
    expect(cardsInStatus(ctx.getBoardDoc(), Status.Todo)).toHaveLength(3);
  });

  it("adds as a copy with no confirmation step", async () => {
    const ctx = setup(twoCards);
    await choose(
      "board.json",
      fileJson([{ id: "c1", title: "Same id as the board", status: "todo" }]),
    );
    fireEvent.click(modeButton(/^Add as copy/));

    expect(await screen.findByText("Import finished")).toBeInTheDocument();
    // The colliding id was remapped, so nothing was overwritten.
    expect(cardsInStatus(ctx.getBoardDoc(), Status.Todo)).toHaveLength(3);
  });

  it("names the cards it kept the board's newer version of, and stays until dismissed", async () => {
    setup((ctx) => {
      twoCards(ctx);
      setCardTitle(ctx.getBoardDoc(), "c1", "Edited on the board", NOW + 1000);
    });
    await choose(
      "board.json",
      fileJson([{ id: "c1", title: "Stale copy", status: "todo", updatedAt: NOW }]),
    );
    fireEvent.click(modeButton(/^Merge/));

    const report = await screen.findByRole("status");
    expect(report).toHaveTextContent("Kept the board's newer version");
    expect(report).toHaveTextContent("Edited on the board");
    // Still on screen after a tick — it is not a toast (KTD6).
    await act(async () => {});
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("reports a name fusion by name, never by id (R10, R17)", async () => {
    setup((ctx) => {
      const doc = ctx.getBoardDoc();
      addLabel(doc, { id: "board-label", name: "Bug", color: "#eb5757", now: NOW, clientId: "1" });
    });
    await choose(
      "board.json",
      JSON.stringify({
        version: 2,
        board: { title: "File board" },
        labels: [{ id: "file-label", name: "bug", color: "#26b5ce" }],
        cards: [],
      }),
    );
    fireEvent.click(modeButton(/^Merge/));

    const report = await screen.findByRole("status");
    expect(report).toHaveTextContent("Joined by name");
    expect(report).toHaveTextContent("bug");
    expect(report).toHaveTextContent("Bug");
    expect(report.textContent).not.toContain("file-label");
  });
});

describe("export (UNIT-22)", () => {
  const clickExportJson = async (): Promise<void> => {
    openMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export as JSON" }));
    });
  };

  it("hands the snapshot to the platform save helper, not straight to a browser download", async () => {
    // The bug this covers: the component used to build a blob URL and click a
    // synthetic <a download>, which the Tauri webview silently ignores. Going
    // through saveFile is what makes the desktop path exist at all.
    saveFileMock.mockResolvedValueOnce({ status: "saved", path: "/tmp/roadmap.json" });
    setup(twoCards);

    await clickExportJson();

    expect(saveFileMock).toHaveBeenCalledTimes(1);
    const [filename, text, mime] = saveFileMock.mock.calls[0]!;
    expect(filename).toBe("roadmap.json");
    expect(mime).toBe("application/json");
    // Real content, not a placeholder: the seeded cards round-trip through it.
    const parsed = JSON.parse(text as string);
    expect(parsed.cards.map((c: { title: string }) => c.title)).toEqual(
      expect.arrayContaining(["Board version", "Board only"]),
    );
  });

  it("confirms a successful save by naming the file", async () => {
    saveFileMock.mockResolvedValueOnce({ status: "saved", path: "/tmp/roadmap.json" });
    setup(twoCards);

    await clickExportJson();

    expect(toastMock).toHaveBeenCalledWith("Saved roadmap.json");
  });

  it("says so when the save fails, rather than closing the menu on a dead click", async () => {
    saveFileMock.mockResolvedValueOnce({ status: "failed" });
    setup(twoCards);

    await clickExportJson();

    expect(toastMock).toHaveBeenCalledWith("Couldn't save the file");
  });

  it("stays silent when the save sheet is cancelled", async () => {
    saveFileMock.mockResolvedValueOnce({ status: "cancelled" });
    setup(twoCards);

    await clickExportJson();

    // Dismissing the dialog is a choice; a toast would report it as a problem.
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("offers JSON as the only export format", async () => {
    setup(twoCards);
    openMenu();

    expect(screen.getByRole("button", { name: "Export as JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /markdown/i })).toBeNull();
  });

  it("accepts only .json on the import picker", async () => {
    setup(twoCards);
    openMenu();

    const input = await waitFor(() => {
      const el = document.querySelector('input[type="file"]');
      if (!el) throw new Error("no file input");
      return el;
    });
    expect(input.getAttribute("accept")).toBe(".json,application/json");
  });
});
