"use client";

import { formatTicketId, normalizeTicketPrefix } from "@boardly/domain";
import { Input } from "@boardly/ui";
import { useEffect, useState } from "react";

import { useSetTicketPrefix, useTicketPrefix } from "../../lib/use-board";

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
    <section className="flex max-w-md flex-col gap-2">
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
  );
}
