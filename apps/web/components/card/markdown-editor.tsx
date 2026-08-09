"use client";

import { cn, toast } from "@boardly/ui";
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternal } from "../../lib/open-external";
import { isTauri } from "../../lib/platform";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const TABS = ["write", "preview"] as const;

// A description link points somewhere outside the app, so it must never navigate
// the sheet (and on desktop, never the whole Tauri webview) away from the board.
// Same split as the Links list (UNIT-9.4): web keeps the native `target="_blank"`
// anchor so cmd/middle-click still work; desktop intercepts and hands the URL to
// the opener plugin, since the webview won't open `_blank` in the OS browser.
// `href` is already protocol-sanitized by react-markdown's default urlTransform,
// and `openExternal` re-checks with `isSafeHttpUrl`.
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children, ...rest }) => (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (!isTauri()) return;
        e.preventDefault();
        void openExternal(href ?? "").then((ok) => {
          if (!ok) toast("Couldn't open that link");
        });
      }}
    >
      {children}
    </a>
  ),
};

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("write");

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
        <textarea
          aria-label="Description"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add a description…  (markdown supported)"
          className="min-h-40 w-full resize-y rounded-[var(--radius-md)] border border-line bg-elevated p-2 text-base leading-relaxed text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] placeholder:text-fg-faint"
        />
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
