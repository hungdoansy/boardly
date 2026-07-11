import type { LinkProvider } from "@boardly/domain";
import { Globe } from "lucide-react";
import { FaSlack } from "react-icons/fa";
import {
  siAirtable,
  siAsana,
  siClaude,
  siConfluence,
  siDropbox,
  siFigma,
  siGithub,
  siGooglecalendar,
  siGoogledocs,
  siGoogledrive,
  siGooglesheets,
  siJira,
  siLinear,
  siLoom,
  siMiro,
  siNotion,
  siTrello,
  siYoutube,
  siZoom,
} from "simple-icons";

/** Every rendered icon (brand SVG, Slack's react-icons mark, or the Globe fallback) is this size. */
const ICON_CLASS = "size-3 shrink-0";

// Real brand marks from simple-icons (github.com/simple-icons/simple-icons,
// ~46k★) — vetted single-path SVGs, bundled locally (no network fetch, no
// per-icon package needed; tree-shaken to just the icons referenced below).
// A few brand hexes are too dark to read against a dark surface (contrast
// <3:1 against the card background) — those render via `currentColor`
// instead, same as GitHub's own UI inverts its mark in dark mode.
const BRAND: Partial<Record<string, { path: string; hex: string; monochrome?: boolean }>> = {
  github: { ...siGithub, monochrome: true },
  linear: siLinear,
  claude: siClaude,
  figma: siFigma,
  notion: { ...siNotion, monochrome: true },
  jira: { ...siJira, monochrome: true },
  confluence: { ...siConfluence, monochrome: true },
  trello: { ...siTrello, monochrome: true },
  google_docs: siGoogledocs,
  google_sheets: siGooglesheets,
  google_drive: siGoogledrive,
  google_calendar: siGooglecalendar,
  loom: siLoom,
  miro: { ...siMiro, monochrome: true },
  dropbox: siDropbox,
  youtube: siYoutube,
  zoom: siZoom,
  asana: siAsana,
  airtable: siAirtable,
};

export function ProviderIcon({ provider }: { provider: LinkProvider }) {
  if (provider === "slack") {
    return <FaSlack aria-hidden="true" className={ICON_CLASS} style={{ color: "#4A154B" }} />;
  }

  const brand = BRAND[provider];
  if (brand) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={brand.monochrome ? `${ICON_CLASS} text-fg-muted` : ICON_CLASS}
        fill={brand.monochrome ? "currentColor" : `#${brand.hex}`}
      >
        <path d={brand.path} />
      </svg>
    );
  }

  return <Globe className={`${ICON_CLASS} text-fg-faint`} aria-hidden="true" />;
}
