// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const { isTauriMock, saveMock, writeTextFileMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(),
  saveMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}));
vi.mock("./platform", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: writeTextFileMock }));

import { saveFile } from "./save-file";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("saveFile — web", () => {
  it("downloads through an anchor and reports saved", async () => {
    isTauriMock.mockReturnValue(false);
    // jsdom has no blob URL support; stub the pair the download path uses.
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const outcome = await saveFile("roadmap.json", '{"a":1}');

    expect(outcome).toEqual({ status: "saved" });
    expect(click).toHaveBeenCalledTimes(1);
    // The blob URL is released rather than leaked for the life of the document.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    // No native call on the web path — the plugins are never even imported.
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("leaves no stray anchor in the document", async () => {
    isTauriMock.mockReturnValue(false);
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:fake", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await saveFile("roadmap.json", "{}");

    expect(document.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("saveFile — desktop", () => {
  it("opens the save sheet and writes the chosen path", async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValueOnce("/Users/me/Desktop/roadmap.json");
    writeTextFileMock.mockResolvedValueOnce(undefined);

    const outcome = await saveFile("roadmap.json", '{"a":1}');

    expect(outcome).toEqual({ status: "saved", path: "/Users/me/Desktop/roadmap.json" });
    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: "roadmap.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    expect(writeTextFileMock).toHaveBeenCalledWith("/Users/me/Desktop/roadmap.json", '{"a":1}');
  });

  it("reports cancelled — not failed — when the sheet is dismissed", async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValueOnce(null);

    const outcome = await saveFile("roadmap.json", "{}");

    // A dismissed dialog is a choice. Surfacing it as an error would tell the
    // user something broke when they simply changed their mind.
    expect(outcome).toEqual({ status: "cancelled" });
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });

  it("reports failed when the write is denied by the fs scope", async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValueOnce("/Users/me/Desktop/roadmap.json");
    // What a missing/too-narrow `fs:allow-write-text-file` path scope looks like
    // from JS — a granted permission alone grants no path (UNIT-9.4's trap).
    writeTextFileMock.mockRejectedValueOnce(
      new Error("forbidden path: /Users/me/Desktop/roadmap.json"),
    );

    await expect(saveFile("roadmap.json", "{}")).resolves.toEqual({ status: "failed" });
  });

  it("reports failed when the dialog itself rejects", async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockRejectedValueOnce(new Error("dialog.save not allowed"));

    await expect(saveFile("roadmap.json", "{}")).resolves.toEqual({ status: "failed" });
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
