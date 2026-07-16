"use client";

import { cn } from "@boardly/ui";
import { ImageOff } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { useAttachmentObjectUrl } from "../../lib/attachments";

type ImgProps = ComponentPropsWithoutRef<"img"> & { node?: unknown };

const IMG_CLASS = "my-2 max-w-full rounded-[var(--radius-md)] border border-line-subtle";

/**
 * `react-markdown` `img` override. Owned references (`/attachments/<id>`) are
 * fetched with the Bearer token and shown via an object URL (see
 * {@link useAttachmentObjectUrl}); external `http(s)` images render as a plain
 * `<img>`. While loading, a token-sized skeleton holds the space; on failure, a
 * quiet broken-image chip (lucide SVG, never a glyph) replaces it.
 */
export function AttachmentImage({ src, alt, node: _node, ...rest }: ImgProps) {
  const source = typeof src === "string" ? src : "";
  const { objectUrl, external, loading, error } = useAttachmentObjectUrl(source);

  if (external) {
    return <img src={source} alt={alt ?? ""} className={IMG_CLASS} {...rest} />;
  }

  if (error) {
    return (
      <span
        role="img"
        aria-label={alt ? `${alt} (failed to load)` : "image failed to load"}
        className="my-2 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-line-subtle bg-surface px-2 py-1.5 text-xs text-fg-faint"
      >
        <ImageOff className="size-4" aria-hidden />
        Image unavailable
      </span>
    );
  }

  if (loading || !objectUrl) {
    return (
      <span
        aria-hidden
        className={cn(
          "my-2 block h-40 w-full max-w-sm animate-pulse rounded-[var(--radius-md)] border border-line-subtle bg-elevated",
        )}
      />
    );
  }

  return <img src={objectUrl} alt={alt ?? ""} className={IMG_CLASS} />;
}
