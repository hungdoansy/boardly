"use client";

import {
  type BoardSnapshot,
  ImportError,
  exportJson,
  exportMarkdown,
  parseJson,
  parseObsidian,
} from "@boardly/domain";
import { execute, exportBoard, importBoard } from "@boardly/commands";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Download, FileJson, FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";

/** Slug a board title for a download filename. */
function slug(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\da-z]+/g, "-")
      .replace(/^-+|-+$/g, "") || "board"
  );
}

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ImportExportMenu({ boardTitle }: { boardTitle: string }) {
  const ctx = useBoardlyContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doExportJson = (): void => {
    const snapshot = execExport();
    if (snapshot) download(`${slug(boardTitle)}.json`, exportJson(snapshot), "application/json");
    setOpen(false);
  };

  const doExportMarkdown = (): void => {
    const snapshot = execExport();
    if (snapshot) download(`${slug(boardTitle)}.md`, exportMarkdown(snapshot), "text/markdown");
    setOpen(false);
  };

  const execExport = (): BoardSnapshot | null => {
    return (execute(exportBoard, ctx, {}) as BoardSnapshot) ?? null;
  };

  const onFile = async (file: File): Promise<void> => {
    setError(null);
    const text = await file.text();
    try {
      const isMarkdown = /\.(md|markdown)$/i.test(file.name) || !text.trimStart().startsWith("{");
      const snapshot = isMarkdown
        ? parseObsidian(text, file.name.replace(/\.[^.]+$/, ""))
        : parseJson(text);
      execute(importBoard, ctx, { snapshot });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ImportError ? err.message : "Could not import this file.");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-fg-muted">
          <Download className="size-3.5" />
          Export
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-56 flex-col gap-0.5 p-1">
        <MenuItem icon={<FileJson className="size-3.5" />} onClick={doExportJson}>
          Export as JSON
        </MenuItem>
        <MenuItem icon={<FileText className="size-3.5" />} onClick={doExportMarkdown}>
          Export as Markdown
        </MenuItem>
        <div className="my-1 border-t border-line-subtle" />
        <MenuItem icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
          Import board…
        </MenuItem>
        <p className="px-2 pt-1 text-xs text-fg-faint">
          JSON (full board) or Obsidian-Kanban markdown. Imports into this board.
        </p>
        {error ? (
          <p role="alert" className="px-2 pt-1 text-xs text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".json,.md,.markdown,application/json,text/markdown"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-selecting the same file
            if (file) void onFile(file);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  icon,
  onClick,
  disabled,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-fg-faint">{icon}</span>
      {children}
    </button>
  );
}
