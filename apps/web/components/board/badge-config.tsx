"use client";

import { BADGE_FIELDS } from "@boardly/domain";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useBadgeConfig, useSetBadgeConfig } from "../../lib/use-board";

const labelOf = (key: string) => BADGE_FIELDS.find((f) => f.key === key)?.label ?? key;

export function BadgeConfig({ boardId }: { boardId: string }) {
  const config = useBadgeConfig(boardId);
  const setConfig = useSetBadgeConfig(boardId);

  const enabled = config.filter((key) => BADGE_FIELDS.some((f) => f.key === key));
  const disabled = BADGE_FIELDS.filter((f) => !config.includes(f.key));

  const toggle = (key: string): void =>
    setConfig(config.includes(key) ? config.filter((k) => k !== key) : [...config, key]);

  const move = (key: string, dir: -1 | 1): void => {
    const i = config.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= config.length) return;
    const next = [...config];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setConfig(next);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-1 pb-1 text-xs text-fg-faint">Badges shown on card faces</p>
      {enabled.map((key, index) => (
        <div
          key={key}
          className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover"
        >
          <input
            type="checkbox"
            aria-label={`Show ${labelOf(key)}`}
            checked
            onChange={() => toggle(key)}
            className="size-3.5 accent-[var(--accent)]"
          />
          <span className="flex-1 text-sm text-fg">{labelOf(key)}</span>
          <button
            type="button"
            aria-label={`Move ${labelOf(key)} up`}
            disabled={index === 0}
            onClick={() => move(key, -1)}
            className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint hover:text-fg disabled:opacity-30"
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move ${labelOf(key)} down`}
            disabled={index === enabled.length - 1}
            onClick={() => move(key, 1)}
            className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint hover:text-fg disabled:opacity-30"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      ))}
      {disabled.map((field) => (
        <label
          key={field.key}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover"
        >
          <input
            type="checkbox"
            aria-label={`Show ${field.label}`}
            checked={false}
            onChange={() => toggle(field.key)}
            className="size-3.5 accent-[var(--accent)]"
          />
          <span className="flex-1 text-sm text-fg-muted">{field.label}</span>
        </label>
      ))}
    </div>
  );
}
