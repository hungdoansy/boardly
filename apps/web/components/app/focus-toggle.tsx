"use client";

import { Button } from "@boardly/ui";
import { Focus } from "lucide-react";

import { type FocusLevel, useFocusMode } from "../../lib/focus-mode";

const LABEL: Record<FocusLevel, string> = { off: "Focus", calm: "Calm", zen: "Zen" };

/** Toolbar indicator: cycles Off → Calm → Zen → Off (also bound to Shift+F). */
export function FocusToggle() {
  const { level, cycle } = useFocusMode();
  const active = level !== "off";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycle}
      aria-label={`Focus mode: ${level}. Cycle with Shift+F`}
      title={`Focus mode: ${level} — Shift+F to cycle`}
      className={active ? "text-fg" : "text-fg-muted"}
    >
      <Focus className="size-3.5" />
      {LABEL[level]}
    </Button>
  );
}
