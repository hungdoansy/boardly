// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api-client", () => ({
  apiClient: { authFetch: vi.fn() },
}));

vi.mock("../../lib/attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/attachments")>();
  return { ...actual, uploadAttachment: vi.fn() };
});

import { apiClient } from "../../lib/api-client";
import { uploadAttachment } from "../../lib/attachments";
import { MarkdownEditor } from "./markdown-editor";

const uploadMock = uploadAttachment as unknown as ReturnType<typeof vi.fn>;
const authFetch = apiClient.authFetch as unknown as ReturnType<typeof vi.fn>;

/** Controlled harness so placeholder→reference replacements reflect in the DOM. */
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <MarkdownEditor value={v} onChange={setV} />;
}

const pngFile = (name = "shot.png") =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });

function firePaste(el: Element, files: File[]) {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", { value: { files } });
  fireEvent(el, e);
}

function fireDropWith(el: Element, files: File[]) {
  const e = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", {
    value: { files, items: files.map(() => ({ kind: "file" })) },
  });
  fireEvent(el, e);
}

function fireDragOverFiles(el: Element) {
  const e = new Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: { items: [{ kind: "file" }], files: [] } });
  fireEvent(el, e);
}

beforeEach(() => {
  uploadMock.mockReset();
  authFetch.mockReset();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarkdownEditor image upload", () => {
  it("pastes an image → placeholder, then the /attachments reference", async () => {
    uploadMock.mockResolvedValue({ id: "IMG1" });
    render(<Harness />);
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;

    firePaste(textarea, [pngFile()]);
    expect(textarea.value).toContain("[uploading image ");
    expect(uploadMock).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(textarea.value).toContain("![shot](/attachments/IMG1)"));
    expect(textarea.value).not.toContain("[uploading image ");
  });

  it("drops an image → uploads and inserts the reference; drag-over shows the affordance", async () => {
    uploadMock.mockResolvedValue({ id: "DROP1" });
    render(<Harness />);
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;

    fireDragOverFiles(textarea);
    expect(textarea.className).toContain("border-[var(--accent)]"); // drag-over affordance

    fireDropWith(textarea, [pngFile("pic.png")]);
    expect(textarea.className).not.toContain("border-[var(--accent)]"); // cleared on drop
    await waitFor(() => expect(textarea.value).toContain("![pic](/attachments/DROP1)"));
  });

  it("ignores a plain-text paste (no upload)", () => {
    render(<Harness />);
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;
    firePaste(textarea, []); // no files
    expect(uploadMock).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });

  it("handles two images at once → two independent references", async () => {
    uploadMock.mockImplementation((file: File) =>
      Promise.resolve({ id: file.name.replace(/\.png$/, "").toUpperCase() }),
    );
    render(<Harness />);
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;

    firePaste(textarea, [pngFile("one.png"), pngFile("two.png")]);
    await waitFor(() => {
      expect(textarea.value).toContain("![one](/attachments/ONE)");
      expect(textarea.value).toContain("![two](/attachments/TWO)");
    });
    expect(textarea.value).not.toContain("[uploading image ");
  });

  it("removes the placeholder and shows an error when upload fails", async () => {
    uploadMock.mockRejectedValue(new Error("boom"));
    render(<Harness />);
    const textarea = screen.getByLabelText("Description") as HTMLTextAreaElement;

    firePaste(textarea, [pngFile()]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't upload/i));
    expect(textarea.value).not.toContain("[uploading image ");
  });

  it("renders an owned image in the preview tab through the authed renderer", async () => {
    authFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["bytes"]) });
    render(<Harness initial={"![a](/attachments/IMG9)"} />);

    fireEvent.click(screen.getByRole("tab", { name: "preview" }));

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "a" });
      expect(img).toHaveAttribute("src", "blob:mock-url");
    });
    expect(authFetch).toHaveBeenCalledWith("/attachments/IMG9");
  });
});
