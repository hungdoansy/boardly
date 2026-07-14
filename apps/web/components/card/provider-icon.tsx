"use client";

import type { LinkProvider } from "@boardly/domain";
import { cn } from "@boardly/ui";
import airtable from "@thesvg/icons/airtable";
import asana from "@thesvg/icons/asana";
import behance from "@thesvg/icons/behance";
import bitbucket from "@thesvg/icons/bitbucket";
import claude from "@thesvg/icons/claude";
import codepen from "@thesvg/icons/codepen";
import confluence from "@thesvg/icons/confluence";
import discord from "@thesvg/icons/discord";
import docker from "@thesvg/icons/docker";
import dribbble from "@thesvg/icons/dribbble";
import dropbox from "@thesvg/icons/dropbox";
import facebook from "@thesvg/icons/facebook";
import figma from "@thesvg/icons/figma";
import github from "@thesvg/icons/github";
import gitlab from "@thesvg/icons/gitlab";
import googleCalendar from "@thesvg/icons/google-calendar";
import googleDocs from "@thesvg/icons/google-docs";
import googleDrive from "@thesvg/icons/google-drive";
import googleMeet from "@thesvg/icons/google-meet";
import googleSheets from "@thesvg/icons/google-sheets";
import instagram from "@thesvg/icons/instagram";
import jira from "@thesvg/icons/jira";
import linear from "@thesvg/icons/linear";
import linkedin from "@thesvg/icons/linkedin";
import loom from "@thesvg/icons/loom";
import medium from "@thesvg/icons/medium";
import miro from "@thesvg/icons/miro";
import notion from "@thesvg/icons/notion";
import npm from "@thesvg/icons/npm";
import pinterest from "@thesvg/icons/pinterest";
import reddit from "@thesvg/icons/reddit";
import replit from "@thesvg/icons/replit";
import slack from "@thesvg/icons/slack";
import spotify from "@thesvg/icons/spotify";
import stackOverflow from "@thesvg/icons/stack-overflow";
import stripe from "@thesvg/icons/stripe";
import telegram from "@thesvg/icons/telegram";
import tiktok from "@thesvg/icons/tiktok";
import trello from "@thesvg/icons/trello";
import twitch from "@thesvg/icons/twitch";
import vimeo from "@thesvg/icons/vimeo";
import whatsapp from "@thesvg/icons/whatsapp";
import wikipedia from "@thesvg/icons/wikipedia";
import x from "@thesvg/icons/x";
import youtube from "@thesvg/icons/youtube";
import zoom from "@thesvg/icons/zoom";
import { Globe } from "lucide-react";
import { useId } from "react";

import { scopeSvgIds } from "./scope-svg-ids";

/** Every rendered icon (brand SVG or the Globe fallback) is this size. */
const ICON_CLASS = "size-3 shrink-0";

/**
 * Real brand marks from thesvg (github.com/glincker/thesvg) — each icon's
 * `svg` field is a complete, self-contained `<svg>` string with its brand
 * colors already baked into the markup (verified directly; the package's
 * separate `hex` metadata field is unreliable for several brands — e.g. it
 * reports "000000" for Slack and LinkedIn, and "fff" for Notion — so we never
 * read it). A handful of brands are near-black or have a data bug in their
 * `default` asset (GitHub's default has a mismatched viewBox/path scale) —
 * those use the package's separate `mono` variant instead, rendered in the
 * current text color so it stays legible against a dark surface.
 */
interface IconModule {
  svg: string;
  variants: Record<string, string>;
}

/** Use an icon's `mono` variant — verified present for every call site below. */
function mono(icon: IconModule): { svg: string; mono: true } {
  const svg = icon.variants.mono;
  if (!svg) throw new Error("expected a mono variant");
  return { svg, mono: true };
}

const BRAND: Partial<Record<string, { svg: string; mono?: boolean }>> = {
  slack,
  linear,
  claude,
  "claude-code": claude,
  figma,
  github: mono(github),
  notion: mono(notion),
  jira,
  confluence: mono(confluence),
  trello,
  google_docs: googleDocs,
  google_sheets: googleSheets,
  google_drive: googleDrive,
  google_calendar: googleCalendar,
  google_meet: googleMeet,
  loom,
  miro: mono(miro),
  dropbox,
  youtube,
  zoom,
  asana,
  airtable,
  facebook,
  twitter: mono(x),
  instagram,
  linkedin,
  reddit,
  discord,
  tiktok: mono(tiktok),
  pinterest,
  whatsapp,
  telegram,
  medium: mono(medium),
  stackoverflow: stackOverflow,
  gitlab,
  bitbucket,
  npm,
  dockerhub: docker,
  spotify,
  twitch,
  vimeo,
  behance,
  dribbble,
  // CodePen's mark is black/white by design and thesvg ships no `mono`
  // variant for it — the default asset has no explicit fill, so forcing
  // currentColor on it is safe and correct in both themes.
  codepen: { svg: codepen.svg, mono: true },
  replit,
  stripe,
  wikipedia: mono(wikipedia),
};

export function ProviderIcon({
  provider,
  className,
}: {
  provider: LinkProvider;
  className?: string;
}) {
  // Some brand SVGs (Figma, Instagram, Reddit, Zoom, ...) reference internal
  // gradient/clip-path ids via url(#x); scope those to this instance so two
  // icons on the same page never resolve each other's ids (see scope-svg-ids).
  const scopeId = useId().replace(/:/g, "");
  const brand = BRAND[provider];
  if (brand) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          ICON_CLASS,
          "inline-block align-middle [&_svg]:block [&_svg]:size-full",
          brand.mono && "text-fg-muted [&_svg]:fill-current",
          className,
        )}
        // `brand` is looked up by `provider`, a fixed LinkProvider enum value
        // (never raw URL/link text), and `brand.svg` is always one of the ~45
        // hardcoded @thesvg/icons imports above, pinned to an exact version —
        // no user or link input ever reaches this string, so injecting it
        // verbatim is safe.
        dangerouslySetInnerHTML={{ __html: scopeSvgIds(brand.svg, scopeId) }}
      />
    );
  }

  return <Globe className={cn(ICON_CLASS, "text-fg-faint", className)} aria-hidden="true" />;
}
