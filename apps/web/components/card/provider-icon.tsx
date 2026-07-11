import type { LinkProvider } from "@boardly/domain";
import { Globe } from "lucide-react";
import { siClaude, siGithub, siLinear } from "simple-icons";

// Real brand marks from simple-icons (github.com/simple-icons/simple-icons,
// ~46k★) — vetted single-path SVGs, bundled locally (no network fetch, no
// per-icon package needed; tree-shaken to just the icons we reference below).
// GitHub's mark is near-black (#181717) — true to brand, but invisible on a
// dark surface — so it renders in the current text color instead of its hex,
// same as GitHub's own UI does in dark mode.
const BRAND: Partial<Record<string, { path: string; hex: string; monochrome?: boolean }>> = {
  github: { ...siGithub, monochrome: true },
  linear: siLinear,
  claude: siClaude,
};

// Slack pulled its logo from simple-icons on request, so it keeps a colored
// monogram fallback instead of a real mark.
const MONO: Record<string, { label: string; bg: string; fg: string }> = {
  slack: { label: "S", bg: "#4A154B", fg: "#ffffff" },
};

export function ProviderIcon({ provider }: { provider: LinkProvider }) {
  const brand = BRAND[provider];
  if (brand) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={brand.monochrome ? "size-3 shrink-0 text-fg-muted" : "size-3 shrink-0"}
        fill={brand.monochrome ? "currentColor" : `#${brand.hex}`}
      >
        <path d={brand.path} />
      </svg>
    );
  }
  const mono = MONO[provider];
  if (mono) {
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
  return <Globe className="size-3 text-fg-faint" aria-hidden="true" />;
}
