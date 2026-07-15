// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-client", () => ({
  apiClient: { authFetch: vi.fn() },
}));

import { apiClient } from "./api-client";
import {
  attachmentIdFromSrc,
  attachmentRef,
  AttachmentUploadError,
  uploadAttachment,
  useAttachmentObjectUrl,
} from "./attachments";

const authFetch = apiClient.authFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authFetch.mockReset();
  // jsdom lacks object-URL APIs; stub them so the hook can create/revoke.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attachmentRef / attachmentIdFromSrc", () => {
  it("round-trips an id through the reference form", () => {
    expect(attachmentRef("abc-123")).toBe("/attachments/abc-123");
    expect(attachmentIdFromSrc("/attachments/abc-123")).toBe("abc-123");
  });

  it("treats external and malformed srcs as non-attachments", () => {
    expect(attachmentIdFromSrc("https://example.com/x.png")).toBeNull();
    expect(attachmentIdFromSrc("/attachments/")).toBeNull();
    expect(attachmentIdFromSrc("/attachments/a/b")).toBeNull();
  });
});

describe("uploadAttachment", () => {
  it("posts multipart via authFetch and returns the id", async () => {
    authFetch.mockResolvedValue({ ok: true, json: async () => ({ id: "att-1" }) });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

    const result = await uploadAttachment(file);

    expect(result).toEqual({ id: "att-1" });
    expect(authFetch).toHaveBeenCalledTimes(1);
    const [path, init] = authFetch.mock.calls[0]!;
    expect(path).toBe("/api/attachments");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("throws AttachmentUploadError on a non-ok response", async () => {
    authFetch.mockResolvedValue({ ok: false, status: 413 });
    const file = new File([new Uint8Array([1])], "big.png", { type: "image/png" });
    await expect(uploadAttachment(file)).rejects.toBeInstanceOf(AttachmentUploadError);
  });

  it("throws AttachmentUploadError when the network call rejects", async () => {
    authFetch.mockRejectedValue(new Error("offline"));
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    await expect(uploadAttachment(file)).rejects.toBeInstanceOf(AttachmentUploadError);
  });

  it("throws when the response is missing an id", async () => {
    authFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    await expect(uploadAttachment(file)).rejects.toBeInstanceOf(AttachmentUploadError);
  });
});

describe("useAttachmentObjectUrl", () => {
  it("fetches an owned attachment and exposes an object URL, revoking on unmount", async () => {
    authFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["bytes"]) });

    const { result, unmount } = renderHook(() => useAttachmentObjectUrl("/attachments/xyz"));

    await waitFor(() => expect(result.current.objectUrl).toBe("blob:mock-url"));
    expect(result.current.external).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(authFetch).toHaveBeenCalledWith("/attachments/xyz");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("treats an external src as external and never fetches", async () => {
    const { result } = renderHook(() => useAttachmentObjectUrl("https://example.com/y.png"));
    expect(result.current.external).toBe(true);
    expect(result.current.objectUrl).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(authFetch).not.toHaveBeenCalled();
  });

  it("surfaces an error when the serve route fails", async () => {
    authFetch.mockResolvedValue({ ok: false, status: 404 });
    const { result } = renderHook(() => useAttachmentObjectUrl("/attachments/gone"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.objectUrl).toBeNull();
  });

  it("revokes the old object URL and creates a new one when the id changes", async () => {
    authFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["bytes"]) });
    const { result, rerender } = renderHook(({ src }) => useAttachmentObjectUrl(src), {
      initialProps: { src: "/attachments/first" },
    });
    await waitFor(() => expect(result.current.objectUrl).toBe("blob:mock-url"));

    rerender({ src: "/attachments/second" });
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith("/attachments/second"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
