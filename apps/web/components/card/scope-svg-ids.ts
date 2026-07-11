/**
 * Some brand SVGs (Figma, Instagram, Reddit, TikTok, Telegram, Zoom, Facebook,
 * the Google Sheets/Calendar/Meet marks, ...) define gradients/clip-paths via
 * `id="x"` and reference them with `url(#x)` / `href="#x"`. Injecting more
 * than one such SVG into the same document with `dangerouslySetInnerHTML`
 * collides those ids — the browser resolves `url(#x)` to whichever element
 * with that id it finds (typically the first one in document order), so a
 * second icon can render with the first icon's gradient. Prefixing every
 * id (and its references) with a value unique to this render instance —
 * `React.useId()` at the call site — makes each icon's ids collision-proof
 * regardless of how many copies of it (or of a differently-colored one
 * sharing the same short id names, e.g. two Reddit links) appear at once.
 */
const ID_REF_RE = /\bid="([^"]+)"|url\(#([^)]+)\)|href="#([^"]+)"/g;

export function scopeSvgIds(svg: string, scopeId: string): string {
  const ids = new Set<string>();
  for (const m of svg.matchAll(ID_REF_RE)) {
    const id = m[1] ?? m[2] ?? m[3];
    if (id) ids.add(id);
  }
  if (ids.size === 0) return svg;

  return svg.replace(ID_REF_RE, (match, idDef, idUrl, idHref) => {
    const id = idDef ?? idUrl ?? idHref;
    if (!ids.has(id)) return match;
    const scoped = `${scopeId}-${id}`;
    if (idDef !== undefined) return `id="${scoped}"`;
    if (idUrl !== undefined) return `url(#${scoped})`;
    return `href="#${scoped}"`;
  });
}
