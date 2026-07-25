/**
 * Prefix every `id="x"` (and its `url(#x)` / `href="#x"` references) with a
 * per-render-instance scope so injecting the same SVG markup twice into one
 * document never lets one instance resolve another's gradients/clip-paths.
 *
 * A self-contained copy of the web app's `scope-svg-ids` so `@boardly/logo`
 * stays dependency-free; the mark defines `boardly-acc*` gradients that would
 * otherwise collide when the sidebar and mobile header both render it.
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
