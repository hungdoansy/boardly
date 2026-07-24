"use client";

import {
  DEFAULT_ZOOM,
  formatTicketId,
  normalizeTicketPrefix,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomIn,
  zoomOut,
} from "@boardly/domain";
import { Button, Input } from "@boardly/ui";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useSetTicketPrefix, useSetZoom, useTicketPrefix, useZoom } from "../../lib/use-board";

/**
 * General board settings. For now: the ticket prefix — uppercase, max 5 chars,
 * empty allowed. It is display-only (ids are stored as integers), so changing it
 * only re-labels tickets and never renumbers anything.
 */
export function GeneralSettings() {
  const prefix = useTicketPrefix();
  const setPrefix = useSetTicketPrefix();
  const [draft, setDraft] = useState(prefix);
  useEffect(() => setDraft(prefix), [prefix]);

  const commit = (value: string): void => {
    const next = normalizeTicketPrefix(value);
    setDraft(next);
    if (next !== prefix) setPrefix(next);
  };

  return (
    <div className="flex max-w-md flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="ticket-prefix" className="text-sm font-medium text-fg">
            Ticket prefix
          </label>
          <p className="text-xs text-fg-muted">
            Uppercase, up to 5 characters. Leave empty to show ids as{" "}
            <span className="font-mono">#123</span>.
          </p>
        </div>
        <Input
          id="ticket-prefix"
          aria-label="Ticket prefix"
          value={draft}
          placeholder="e.g. TEC"
          maxLength={5}
          onChange={(e) => setDraft(normalizeTicketPrefix(e.target.value))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          }}
          className="font-mono uppercase"
        />
        <p className="text-xs text-fg-faint">
          Preview: <span className="font-mono text-fg-muted">{formatTicketId(draft, 42)}</span>
        </p>
      </section>

      <ZoomSetting />
    </div>
  );
}

/**
 * Whole-app zoom control (UNIT-15). The keyboard path is ⌘/Ctrl +/−/0; this is
 * the discoverable, pointer-driven mirror plus a live readout. The level is a
 * synced per-user preference, so it reads the same value the shortcuts write.
 */
function ZoomSetting() {
  const zoom = useZoom();
  const setZoom = useSetZoom();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">Zoom</span>
        <p className="text-xs text-fg-muted">
          Scales the whole app. Also <span className="font-mono">⌘/Ctrl</span> with{" "}
          <span className="font-mono">+</span>, <span className="font-mono">−</span>, or{" "}
          <span className="font-mono">0</span>. Synced across your devices.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom out"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom(zoomOut(zoom))}
        >
          <Minus className="size-4" />
        </Button>
        <span className="min-w-[3.5rem] text-center font-mono text-sm text-fg tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom in"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom(zoomIn(zoom))}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-1"
          disabled={zoom === DEFAULT_ZOOM}
          onClick={() => setZoom(DEFAULT_ZOOM)}
        >
          Reset
        </Button>
      </div>
    </section>
  );
}
