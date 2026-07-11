"use client";

import { cn } from "@boardly/ui";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { BadgeConfig } from "../board/badge-config";
import { GeneralSettings } from "./general-settings";
import { ProjectSettings } from "./project-settings";

type SectionKey = "general" | "card-display" | "projects";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "card-display", label: "Card display" },
  { key: "projects", label: "Projects" },
];

const TITLES: Record<SectionKey, string> = {
  general: "General",
  "card-display": "Card display",
  projects: "Projects",
};

/**
 * Full-screen, Linear-style settings surface with a left sub-nav. Replaces the
 * board in the main area while the `#settings` route is active. Houses the
 * board-level ticket prefix, the card-face display config, and project mgmt.
 */
export function SettingsView({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [section, setSection] = useState<SectionKey>("general");

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle px-4">
        <button
          type="button"
          aria-label="Back to board"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-fg-muted transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="text-md font-semibold tracking-[-0.01em] text-fg">Settings</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-line-subtle p-2"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-current={section === s.key ? "page" : undefined}
              onClick={() => setSection(s.key)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                section === s.key ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-lg font-semibold tracking-[-0.01em] text-fg">
            {TITLES[section]}
          </h2>
          {section === "general" ? <GeneralSettings boardId={boardId} /> : null}
          {section === "card-display" ? (
            <div className="max-w-md">
              <p className="mb-2 text-sm text-fg-muted">
                Choose which badges appear on card faces, and their order.
              </p>
              <BadgeConfig boardId={boardId} />
            </div>
          ) : null}
          {section === "projects" ? <ProjectSettings boardId={boardId} /> : null}
        </main>
      </div>
    </div>
  );
}
