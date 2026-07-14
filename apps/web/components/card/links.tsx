"use client";

import type { Card } from "@boardly/domain";
import {
  claudeResumeCommand,
  formatClaudeResumeUrl,
  isSafeHttpUrl,
  linkLabel,
  linkSubtitle,
  parseClaudeResume,
  parseClaudeResumeUrl,
  stripDeepLinkMarker,
} from "@boardly/domain";
import { Button, Input, toast } from "@boardly/ui";
import { ArrowUpRight, ChevronDown, ChevronUp, Copy, Plus, X } from "lucide-react";
import { useState } from "react";

import { copyText } from "../../lib/clipboard";
import { openExternal } from "../../lib/open-external";
import { isTauri } from "../../lib/platform";
import { useLinkActions } from "../../lib/use-board";
import { ProviderIcon } from "./provider-icon";

export function CardLinks({ card }: { card: Card }) {
  const actions = useLinkActions();
  const [url, setUrl] = useState("");

  const add = (): void => {
    const trimmed = url.trim();
    if (!trimmed) return;
    // A pasted `claude --resume <id>` command isn't a URL — canonicalize it to a
    // claude-code:// link so it flows through the normal add pipeline.
    const sessionId = parseClaudeResume(trimmed);
    void actions.add(card.id, sessionId ? formatClaudeResumeUrl(sessionId) : trimmed);
    setUrl("");
  };

  return (
    <div className="flex flex-col gap-2">
      {card.links.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
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
                className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover"
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
                    <Copy className="size-3 shrink-0 text-fg-faint" aria-hidden />
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
                      <ArrowUpRight className="size-3 shrink-0 text-fg-faint" aria-hidden />
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
