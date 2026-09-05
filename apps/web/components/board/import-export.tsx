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
import type { ImportMode, ImportResult } from "@boardly/sync";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@boardly/ui";
import {
  CopyPlus,
  Download,
  FileJson,
  FileText,
  GitMerge,
  Replace,
  TriangleAlert,
  Upload,
} from "lucide-react";
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

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The three counts a person needs to judge an import, in one phrase. */
const contentSummary = (cards: number, projects: number, labels: number): string =>
  [plural(cards, "card"), plural(projects, "project"), plural(labels, "label")].join(", ");

/**
 * A parsed file waiting for a mode. `hasStableIds` is false for markdown:
 * `parseObsidian` generates a fresh id for every card on every parse, so merging
 * the same file twice would add a second copy of everything (R9).
 */
interface PendingImport {
  snapshot: BoardSnapshot;
  hasStableIds: boolean;
}

interface ModeOption {
  mode: ImportMode;
  label: string;
  /** Its one-line effect on existing board content (R24). */
  effect: string;
  icon: React.ReactNode;
  danger?: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: "merge",
    label: "Merge",
    effect: "Adds what is missing and updates what is older. Never deletes.",
    icon: <GitMerge className="size-4" />,
  },
  {
    mode: "copy",
    label: "Add as copy",
    effect: "Adds everything under new ids. Nothing already on the board changes.",
    icon: <CopyPlus className="size-4" />,
  },
  {
    mode: "replace",
    label: "Replace",
    effect: "Deletes everything on this board, then loads the file. Cannot be undone.",
    icon: <Replace className="size-4" />,
    danger: true,
  },
];

export function ImportExportMenu({ boardTitle }: { boardTitle: string }) {
  const ctx = useBoardlyContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const execExport = (): BoardSnapshot | null => {
    return (execute(exportBoard, ctx, {}) as BoardSnapshot) ?? null;
  };

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

  const onFile = async (file: File): Promise<void> => {
    setError(null);
    const text = await file.text();
    try {
      const isMarkdown = /\.(md|markdown)$/i.test(file.name) || !text.trimStart().startsWith("{");
      const snapshot = isMarkdown
        ? parseObsidian(text, file.name.replace(/\.[^.]+$/, ""))
        : parseJson(text);
      // Parsing succeeded, so the destructive choice can be described with real
      // numbers before it is offered (R16). Nothing is written yet.
      setOpen(false);
      setApplyError(null);
      setResult(null);
      setConfirming(false);
      setPending({ snapshot, hasStableIds: !isMarkdown });
    } catch (err) {
      setError(err instanceof ImportError ? err.message : "Could not import this file.");
    }
  };

  const closeImport = (): void => {
    setPending(null);
    setConfirming(false);
    setResult(null);
    setApplyError(null);
  };

  const run = (mode: ImportMode): void => {
    if (!pending) return;
    try {
      const outcome = execute(importBoard, ctx, {
        snapshot: pending.snapshot,
        mode,
        ...(mode === "replace" ? { acknowledgeReplace: true as const } : {}),
      });
      setConfirming(false);
      setResult(outcome);
    } catch (err) {
      setConfirming(false);
      setApplyError(
        err instanceof ImportError ? err.message : "Could not import this file. Nothing changed.",
      );
    }
  };

  const board = pending && confirming ? execExport() : null;

  return (
    <>
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
            JSON (full board) or Obsidian-Kanban markdown. You choose what happens next.
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

      <Dialog open={pending !== null} onOpenChange={(o) => !o && closeImport()}>
        <DialogContent
          className={confirming || result ? "max-w-sm" : "max-w-md"}
          aria-describedby={undefined}
        >
          {result ? (
            <ImportReport result={result} onDismiss={closeImport} />
          ) : confirming ? (
            <ReplaceConfirmation
              incoming={pending?.snapshot ?? null}
              boardSnapshot={board}
              onCancel={() => setConfirming(false)}
              onConfirm={() => run("replace")}
            />
          ) : (
            <ModePicker
              pending={pending}
              applyError={applyError}
              onPick={(mode) => (mode === "replace" ? setConfirming(true) : run(mode))}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModePicker({
  pending,
  applyError,
  onPick,
}: {
  pending: PendingImport | null;
  applyError: string | null;
  onPick: (mode: ImportMode) => void;
}) {
  const snapshot = pending?.snapshot;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import into this board</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-fg-muted">
        <span className="text-fg">{snapshot?.board.title || "Untitled board"}</span> —{" "}
        {snapshot
          ? contentSummary(snapshot.cards.length, snapshot.projects.length, snapshot.labels.length)
          : null}
      </p>
      <div className="flex flex-col gap-1">
        {MODE_OPTIONS.map((option) => {
          // Always shown, never omitted: a silently absent option reads as a bug.
          const blocked = option.mode === "merge" && pending?.hasStableIds === false;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={blocked}
              onClick={() => onPick(option.mode)}
              className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-line-subtle px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span
                className={option.danger ? "mt-0.5 text-[var(--danger)]" : "mt-0.5 text-fg-faint"}
              >
                {option.icon}
              </span>
              <span className="flex flex-col gap-0.5">
                <span
                  className={option.danger ? "text-sm text-[var(--danger)]" : "text-sm text-fg"}
                >
                  {option.label}
                </span>
                <span className="text-xs text-fg-muted">
                  {blocked
                    ? "Markdown has no stable ids, so merging would add a second copy every time."
                    : option.effect}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {applyError ? (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {applyError}
        </p>
      ) : null}
    </>
  );
}

function ReplaceConfirmation({
  incoming,
  boardSnapshot,
  onCancel,
  onConfirm,
}: {
  incoming: BoardSnapshot | null;
  boardSnapshot: BoardSnapshot | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Replace this board?</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2 text-sm text-fg-muted">
        <p>
          This deletes{" "}
          <span className="text-fg">
            {boardSnapshot
              ? contentSummary(
                  boardSnapshot.cards.length,
                  boardSnapshot.projects.length,
                  boardSnapshot.labels.length,
                )
              : "everything on this board"}
          </span>{" "}
          from this board, archived items included.
        </p>
        <p>
          It then loads{" "}
          <span className="text-fg">
            {incoming
              ? contentSummary(
                  incoming.cards.length,
                  incoming.projects.length,
                  incoming.labels.length,
                )
              : "the file"}
          </span>{" "}
          from <span className="text-fg">{incoming?.board.title || "the file"}</span>. This
          can&rsquo;t be undone.
        </p>
        <p className="flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
          <span>
            This applies to every signed-in device. A device that is offline right now may keep some
            of the old board when it reconnects.
          </span>
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          <Replace className="size-3.5" />
          Replace board
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * What the import did. A panel rather than a toast: it is the only record that
 * an import happened, and an auto-dismissing line cannot carry fusions, stale
 * skips and dropped references (KTD6, R17). Entities are named, never id'd.
 */
function ImportReport({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  const lines: string[] = [];
  const countLine = (kind: string, counts: ImportResult["cards"]): void => {
    const parts: string[] = [];
    if (counts.created) parts.push(`${counts.created} added`);
    if (counts.updated) parts.push(`${counts.updated} updated`);
    if (counts.skipped) parts.push(`${counts.skipped} left alone`);
    if (parts.length) lines.push(`${kind}: ${parts.join(", ")}.`);
  };
  countLine("Cards", result.cards);
  countLine("Projects", result.projects);
  countLine("Labels", result.labels);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import finished</DialogTitle>
      </DialogHeader>
      <div role="status" className="flex flex-col gap-3 text-sm">
        {lines.length ? (
          <ul className="flex flex-col gap-0.5 text-fg-muted">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted">Nothing changed — the board already had all of it.</p>
        )}

        {result.fusions.length ? (
          <ReportSection title="Joined by name">
            {result.fusions.map((fusion) => (
              <li key={`${fusion.kind}-${fusion.fromId}`}>
                “{fusion.fromName}” joined “{fusion.intoName}”
              </li>
            ))}
          </ReportSection>
        ) : null}

        {result.stale.length ? (
          <ReportSection title="Kept the board's newer version">
            {result.stale.map((skip) => (
              <li key={skip.cardId}>“{skip.title}”</li>
            ))}
          </ReportSection>
        ) : null}

        {result.dropped.length ? (
          <ReportSection title="Links that pointed at nothing">
            <li>{plural(result.dropped.length, "reference")} dropped.</li>
          </ReportSection>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-fg-faint">{title}</p>
      <ul className="flex flex-col gap-0.5 text-xs text-fg-muted">{children}</ul>
    </div>
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
