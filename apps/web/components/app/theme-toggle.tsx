"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "../../lib/theme";

/** Sidebar theme switch: flips between dark and light (persisted). */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const nextIsLight = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${nextIsLight ? "light" : "dark"} theme`}
      title={`Switch to ${nextIsLight ? "light" : "dark"} theme`}
      className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
    </button>
  );
}
