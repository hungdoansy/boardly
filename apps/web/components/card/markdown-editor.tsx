"use client";

import { cn } from "@boardly/ui";
import type { ClipboardEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { attachmentRef, uploadAttachment } from "../../lib/attachments";
import { AttachmentImage } from "./attachment-image";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const TABS = ["write", "preview"] as const;

// Render owned `/attachments/<id>` images via the authenticated blob-fetch
// renderer; everything else (external URLs) falls back to a plain <img>.
const MARKDOWN_COMPONENTS = { img: AttachmentImage } as const;

const imageFilesFrom = (list: FileList): File[] =>
  Array.from(list).filter((f) => f.type.startsWith("image/"));

/** Derive a clean markdown alt text from a filename (drop extension + markdown-breaking chars). */
const altFromFilename = (name: string): string =>
  name
    .replace(/\.[^./\\]+$/, "")
    .replace(/[[\]()]/g, "")
    .trim() || "image";

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("write");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track the latest value so async upload callbacks replace their placeholder
  // in the current text (not a stale snapshot), even across concurrent uploads.
  const valueRef = useRef(value);
  valueRef.current = value;

  const replacePlaceholder = (placeholder: string, replacement: string): void => {
    const current = valueRef.current;
    if (!current.includes(placeholder)) return;
    const next = current.replace(placeholder, replacement);
    valueRef.current = next;
    onChange(next);
  };

  const handleImageFiles = (files: File[], selStart: number, selEnd: number): void => {
    if (files.length === 0) return;
    setError(null);

    const items = files.map((file) => {
      const token = crypto.randomUUID().slice(0, 8);
      return { file, placeholder: `[uploading image ${token}]` };
    });

    // Insert every placeholder at the caret in one edit, on its own line.
    const base = valueRef.current;
    const before = base.slice(0, selStart);
    const after = base.slice(selEnd);
    const block =
      (before.length > 0 && !before.endsWith("\n") ? "\n" : "") +
      items.map((i) => i.placeholder).join("\n") +
      (after.length > 0 && !after.startsWith("\n") ? "\n" : "");
    const next = `${before}${block}${after}`;
    valueRef.current = next;
    onChange(next);

    for (const { file, placeholder } of items) {
      void (async () => {
        try {
          const { id } = await uploadAttachment(file);
          replacePlaceholder(placeholder, `![${altFromFilename(file.name)}](${attachmentRef(id)})`);
        } catch {
          replacePlaceholder(placeholder, "");
          setError("Couldn't upload an image. Please try again.");
        }
      })();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = imageFilesFrom(e.clipboardData.files);
    if (files.length === 0) return; // plain text/paste → default behavior
    e.preventDefault();
    handleImageFiles(files, e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
  };

  const onDragOver = (e: DragEvent<HTMLTextAreaElement>): void => {
    if (Array.from(e.dataTransfer.items).some((i) => i.kind === "file")) {
      e.preventDefault(); // enable drop
      setDragging(true);
    }
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>): void => {
    const files = imageFilesFrom(e.dataTransfer.files);
    setDragging(false);
    if (files.length === 0) return;
    e.preventDefault();
    const pos = e.currentTarget.selectionStart ?? valueRef.current.length;
    handleImageFiles(files, pos, e.currentTarget.selectionEnd ?? pos);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1" role="tablist" aria-label="Description editor">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-[var(--radius-sm)] px-2 py-0.5 text-xs capitalize transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              tab === t ? "bg-overlay text-fg" : "text-fg-faint hover:text-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "write" ? (
        <>
          <textarea
            ref={textareaRef}
            aria-label="Description"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            placeholder="Add a description…  (markdown supported — paste or drop an image)"
            className={cn(
              "min-h-40 w-full resize-y rounded-[var(--radius-md)] border bg-elevated p-2 text-base leading-relaxed text-fg outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] placeholder:text-fg-faint",
              dragging ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-line",
            )}
          />
          {error ? (
            <p role="alert" className="text-xs text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <div className="prose-boardly min-h-40 rounded-[var(--radius-md)] border border-line-subtle bg-surface p-3 text-base text-fg">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {value}
            </ReactMarkdown>
          ) : (
            <p className="text-fg-faint">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
