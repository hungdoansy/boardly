import type { LinkProvider } from "@boardly/domain";
import { Globe } from "lucide-react";

// Bundled provider marks (monogram chips; no network fetch). Generic uses a globe.
const MONO: Record<string, { label: string; bg: string; fg: string }> = {
  slack: { label: "S", bg: "#4A154B", fg: "#ffffff" },
  linear: { label: "L", bg: "#5E6AD2", fg: "#ffffff" },
  github: { label: "GH", bg: "#e6edf3", fg: "#0d1117" },
  claude: { label: "C", bg: "#D97757", fg: "#ffffff" },
};

export function ProviderIcon({ provider }: { provider: LinkProvider }) {
  const mono = MONO[provider];
  if (!mono) return <Globe className="size-3 text-fg-faint" aria-hidden="true" />;
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-3.5 shrink-0 place-items-center rounded-[3px] text-[8px] font-bold leading-none"
      style={{ backgroundColor: mono.bg, color: mono.fg }}
    >
      {mono.label}
    </span>
  );
}
