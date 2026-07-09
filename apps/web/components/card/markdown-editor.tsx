"use client";

import { cn } from "@boardly/ui";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const TABS = ["write", "preview"] as const;

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-fg-faint">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
