"use client";

import type { Card } from "@boardly/domain";
import {
  claudeResumeCommand,
  formatClaudeResumeUrl,
  isSafeHttpUrl,
  linkLabel,
  linkSubtitle,
  normalizeUrl,
  parseClaudeResume,
  parseClaudeResumeUrl,
  stripDeepLinkMarker,
} from "@boardly/domain";
import { Button, cn, Input, toast } from "@boardly/ui";
import { ArrowUpRight, ChevronDown, ChevronUp, Copy, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { copyText } from "../../lib/clipboard";
import { openExternal } from "../../lib/open-external";
import { isTauri } from "../../lib/platform";
import { useLinkActions } from "../../lib/use-board";
import { ProviderIcon } from "./provider-icon";

// How long a just-added (or re-pasted duplicate) link stays highlighted before
// the accent wash fades out (`--dur-slow`, per DESIGN.md §6).
const HIGHLIGHT_HOLD_MS = 2000;

export function CardLinks({ card }: { card: Card }) {
  const actions = useLinkActions();
  const [url, setUrl] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // `addLink` de-dupes by normalized URL and is fire-and-forget here, so the
  // new link's id isn't available to this component synchronously. Instead we
  // arm `awaitingNewId` before calling it and, once the resulting re-render
  // shows an id that wasn't there before, that's the one to highlight.
  const knownIdsRef = useRef<ReadonlySet<string>>(new Set(card.links.map((link) => link.id)));
  const awaitingNewIdRef = useRef(false);

  useEffect(() => {
    const ids = new Set(card.links.map((link) => link.id));
    if (awaitingNewIdRef.current) {
      const added = card.links.find((link) => !knownIdsRef.current.has(link.id));
      if (added) {
        setHighlightId(added.id);
        awaitingNewIdRef.current = false;
      }
    }
    knownIdsRef.current = ids;
  }, [card.links]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_HOLD_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (!highlightId) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-link-id="${CSS.escape(highlightId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightId]);

  const add = (): void => {
    const trimmed = url.trim();
    if (!trimmed) return;
    // A pasted `claude --resume <id>` command isn't a URL — canonicalize it to a
    // claude-code:// link so it flows through the normal add pipeline.
    const sessionId = parseClaudeResume(trimmed);
    const finalUrl = sessionId ? formatClaudeResumeUrl(sessionId) : trimmed;
    // Same normalization `addLink` de-dupes with — if it matches an existing
    // link, that's the one that'll get reused (and highlighted); otherwise a
    // new one is coming.
    const target = normalizeUrl(finalUrl);
    const existing = card.links.find((link) => normalizeUrl(link.url) === target);
    if (existing) {
      setHighlightId(existing.id);
    } else {
      awaitingNewIdRef.current = true;
    }
    void actions.add(card.id, finalUrl);
    setUrl("");
  };

  return (
    <div className="flex flex-col gap-2">
      {card.links.length > 0 ? (
        <ul ref={listRef} className="flex flex-col gap-0.5">
          {card.links.map((link, index) => {
            const { label, isDeepLink: deepLink } = stripDeepLinkMarker(linkLabel(link));
            const subtitle = linkSubtitle(link);
            // Reorder by moving between the neighbors one slot further out (same
            // fractional-ord pattern as the checklist).
            const moveUp = (): void =>
              actions.move(card.id, link.id, {
                afterId: card.links[index - 2]?.id ?? null,
                beforeId: card.links[index - 1]?.id ?? null,
              });
            const moveDown = (): void =>
              actions.move(card.id, link.id, {
                afterId: card.links[index + 1]?.id ?? null,
                beforeId: card.links[index + 2]?.id ?? null,
              });
            // A Claude Code session has no page to open — clicking copies the
            // `claude --resume <id>` command to the clipboard instead.
            const sessionId = parseClaudeResumeUrl(link.url);
            const copyResume = async (): Promise<void> => {
              if (!sessionId) return;
              const ok = await copyText(claudeResumeCommand(sessionId));
              toast(ok ? "Resume command copied" : "Couldn't copy — copy it manually");
            };
            return (
              <li
                key={link.id}
                data-link-id={link.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-[var(--radius-sm)] border-l-2 border-l-transparent px-1 py-0.5 transition-colors duration-[var(--dur-slow)] hover:bg-hover",
                  link.id === highlightId && "border-l-[var(--accent)] bg-selected",
                )}
              >
                {sessionId ? (
                  <button
                    type="button"
                    aria-label={`Copy resume command for ${label}`}
                    onClick={() => void copyResume()}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <ProviderIcon provider={link.provider} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <Copy
                      className="size-3 shrink-0 text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-hidden
                    />
                  </button>
                ) : (
                  <a
                    href={isSafeHttpUrl(link.url) ? link.url : "#"}
                    target="_blank"
                    rel="noreferrer"
                    // On desktop the Tauri webview won't open a `target="_blank"`
                    // anchor in the OS browser, so intercept and route through the
                    // opener plugin. On web the native anchor is left alone
                    // (preserves cmd/middle-click and new-tab).
                    onClick={(e) => {
                      if (isTauri()) {
                        e.preventDefault();
                        void openExternal(link.url);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <ProviderIcon provider={link.provider} />
                    <span className="min-w-0 flex-1 truncate">
                      {label}
                      {subtitle ? (
                        <span className="ml-1.5 text-fg-faint no-underline">{subtitle}</span>
                      ) : null}
                    </span>
                    {deepLink ? (
                      <ArrowUpRight
                        className="size-3 shrink-0 text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-hidden
                      />
                    ) : null}
                  </a>
                )}
                <div className="flex items-center opacity-0 transition-opacity duration-[var(--dur-fast)] focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Move ${label} up`}
                    disabled={index === 0}
                    onClick={moveUp}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} down`}
                    disabled={index === card.links.length - 1}
                    onClick={moveDown}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove link ${label}`}
                    onClick={() => actions.remove(card.id, link.id)}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-[color,background-color] duration-[var(--dur-fast)] hover:bg-hover hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex gap-1">
        <Input
          aria-label="New link URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Paste a URL…"
        />
        <Button
          type="button"
          size="iconSm"
          aria-label="Add link"
          onClick={add}
          disabled={!url.trim()}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
