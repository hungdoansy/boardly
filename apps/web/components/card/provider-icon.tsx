import type { LinkProvider } from "@boardly/domain";
import { Globe } from "lucide-react";
import { FaCodepen, FaLinkedinIn, FaSlack } from "react-icons/fa";
import type { IconType } from "react-icons/lib";
import {
  siAirtable,
  siAsana,
  siBehance,
  siBitbucket,
  siClaude,
  siConfluence,
  siDiscord,
  siDocker,
  siDribbble,
  siDropbox,
  siFacebook,
  siFigma,
  siGithub,
  siGitlab,
  siGooglecalendar,
  siGoogledocs,
  siGoogledrive,
  siGooglemeet,
  siGooglesheets,
  siInstagram,
  siJira,
  siLinear,
  siLoom,
  siMedium,
  siMiro,
  siNotion,
  siNpm,
  siPinterest,
  siReddit,
  siReplit,
  siSpotify,
  siStackoverflow,
  siStripe,
  siTelegram,
  siTiktok,
  siTrello,
  siTwitch,
  siVimeo,
  siWhatsapp,
  siWikipedia,
  siX,
  siYoutube,
  siZoom,
} from "simple-icons";

/** Every rendered icon (brand SVG, react-icons mark, or the Globe fallback) is this size. */
const ICON_CLASS = "size-3 shrink-0";

// Real brand marks from simple-icons (github.com/simple-icons/simple-icons,
// ~46k★) — vetted single-path SVGs, bundled locally (no network fetch, no
// per-icon package needed; tree-shaken to just the icons referenced below).
// A few brand hexes are too dark to read against a dark surface (contrast
// <3:1 against the card background, computed via the WCAG relative-luminance
// formula) — those render via `currentColor` instead, same as GitHub's own UI
// inverts its mark in dark mode.
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
  google_meet: siGooglemeet,
  loom: siLoom,
  miro: { ...siMiro, monochrome: true },
  dropbox: siDropbox,
  youtube: siYoutube,
  zoom: siZoom,
  asana: siAsana,
  airtable: siAirtable,
  facebook: siFacebook,
  twitter: { ...siX, monochrome: true },
  instagram: siInstagram,
  reddit: siReddit,
  discord: siDiscord,
  tiktok: { ...siTiktok, monochrome: true },
  pinterest: siPinterest,
  whatsapp: siWhatsapp,
  telegram: siTelegram,
  medium: { ...siMedium, monochrome: true },
  stackoverflow: siStackoverflow,
  gitlab: siGitlab,
  bitbucket: { ...siBitbucket, monochrome: true },
  npm: siNpm,
  dockerhub: siDocker,
  spotify: siSpotify,
  twitch: siTwitch,
  vimeo: siVimeo,
  behance: siBehance,
  dribbble: siDribbble,
  replit: siReplit,
  stripe: siStripe,
  wikipedia: { ...siWikipedia, monochrome: true },
};

// simple-icons dropped these marks on brand-owner request; react-icons'
// Font Awesome set (github.com/react-icons/react-icons, ~11k★) has them.
const REACT_ICON: Partial<Record<string, { Icon: IconType; hex: string }>> = {
  slack: { Icon: FaSlack, hex: "#4A154B" },
  linkedin: { Icon: FaLinkedinIn, hex: "#0A66C2" },
  codepen: { Icon: FaCodepen, hex: "" }, // brand mark is black/white — always monochrome
};

export function ProviderIcon({ provider }: { provider: LinkProvider }) {
  const fromReactIcons = REACT_ICON[provider];
  if (fromReactIcons) {
    const { Icon, hex } = fromReactIcons;
    return hex ? (
      <Icon aria-hidden="true" className={ICON_CLASS} style={{ color: hex }} />
    ) : (
      <Icon aria-hidden="true" className={`${ICON_CLASS} text-fg-muted`} />
    );
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
