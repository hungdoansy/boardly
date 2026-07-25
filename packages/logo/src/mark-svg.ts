/**
 * The Boardly brand mark — an "airy B" of two horizontal D-lobe cards stacked
 * with a waist gap, each on a fixed brand gradient. This string is the single
 * source of truth for the React render path (`<BoardlyMark/>`); the identical
 * markup also lives at `assets/mark.svg` for the file-based consumers (favicon
 * copy, raster generation). A parity test (`boardly-mark.test.tsx`) asserts the
 * two never drift.
 *
 * The gradient/shadow colors are literal, intentional brand values — not theme
 * tokens (DESIGN.md §7 allows brand-color exceptions). The internal gradient
 * ids (`boardly-acc*`) are scoped per render instance by `<BoardlyMark/>` so two
 * marks on one page never resolve each other's gradients (see scope-svg-ids).
 */
export const MARK_SVG = `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="boardly-acc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6E79DE"/><stop offset="1" stop-color="#505BC4"/>
    </linearGradient>
    <linearGradient id="boardly-accB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5E6AD2"/><stop offset="1" stop-color="#4954B8"/>
    </linearGradient>
  </defs>
  <!-- Airy B: two horizontal D-lobe cards (flat left = stem, round right = bowls),
       stacked with a waist gap; each card has a soft offset shadow. -->
  <g transform="translate(4,5)">
    <g fill="#3A429E">
      <path transform="translate(3,4)"  d="M10 0 L83 0 A25 25 0 0 1 83 50 L10 50 Q0 50 0 40 L0 10 Q0 0 10 0 Z"/>
      <path transform="translate(3,68)" d="M10 0 L93 0 A25 25 0 0 1 93 50 L10 50 Q0 50 0 40 L0 10 Q0 0 10 0 Z"/>
    </g>
    <path transform="translate(0,0)"  d="M10 0 L83 0 A25 25 0 0 1 83 50 L10 50 Q0 50 0 40 L0 10 Q0 0 10 0 Z" fill="url(#boardly-acc)"/>
    <path transform="translate(0,64)" d="M10 0 L93 0 A25 25 0 0 1 93 50 L10 50 Q0 50 0 40 L0 10 Q0 0 10 0 Z" fill="url(#boardly-accB)"/>
  </g>
</svg>`;
