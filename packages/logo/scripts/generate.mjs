// Rasterize the brand SVGs into the committed asset set consumed downstream:
//   - the web favicon      (mark.svg — copied into apps/web/public/logo by sync-logo.mjs)
//   - the desktop app icon (mark-padded.svg — icon-1024.png feeds `tauri icon`)
//   - the web apple-touch  (app-icon.svg tile — apple-touch-icon.png / app-icon-1024.png)
//
// MANUAL, on-logo-change only — NOT part of dev/build. After editing a source
// SVG, run:  pnpm --filter @boardly/logo generate
// then regenerate the desktop icon set (see docs/units/UNIT-16-logo-package.md).
//
// Outputs are committed so dev/build only has to copy, never rasterize.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "assets");
const outDir = join(assets, "generated");

/** The SVG's declared width in user units (drives the rasterization density). */
function svgWidth(svgText) {
  const m = svgText.match(/<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/);
  return m ? Number(m[1]) : 128;
}

// The desktop app icon's flat background (the "Canvas" brand color, = --bg-base
// light). A flat fill (not a rounded tile) — macOS won't round it, so it ships
// as a square. Only the desktop icon uses this; the favicon stays transparent.
const ICON_BG = "#F6F7F8";

// Rasterize an SVG to a square PNG. Density is picked per source so the SVG
// rasterizes at ~2x the target (SUPERSAMPLE) before resize — crisp whether the
// source viewBox is 128 (marks) or 1024 (the tile), upscaled or downscaled.
// With `background`, the transparent mark is flattened onto that flat color.
const SUPERSAMPLE = 2;

async function renderPng(srcSvg, size, outName, { background } = {}) {
  const buf = await readFile(join(assets, srcSvg));
  const density = Math.max(72, Math.ceil(((size * SUPERSAMPLE) / svgWidth(buf.toString())) * 72));
  let img = sharp(buf, { density }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) img = img.flatten({ background });
  await img.png().toFile(join(outDir, outName));
  console.log(
    `  ${outName.padEnd(22)} <- ${srcSvg} @ ${size}px${background ? ` on ${background}` : ""}`,
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });
  console.log("Generating brand rasters -> assets/generated/");

  // Favicon: the tight, transparent mark (fills a small tab; reads light + dark).
  await writeFile(join(outDir, "favicon.svg"), await readFile(join(assets, "mark.svg")));
  console.log("  favicon.svg            <- mark.svg (copy)");
  await renderPng("mark.svg", 32, "favicon-32.png");

  // Desktop app icon source: the SAME mark with bigger padding so it reads well
  // at Dock/taskbar sizes. `tauri icon` turns this into .icns/.ico/pngs
  // (see apps/desktop/scripts/gen-icons.mjs).
  await renderPng("mark-padded.svg", 1024, "icon-1024.png", { background: ICON_BG });

  // Web apple-touch / PWA icon: the opaque square tile (iOS renders it opaque).
  await renderPng("app-icon.svg", 180, "apple-touch-icon.png");
  await renderPng("app-icon.svg", 1024, "app-icon-1024.png");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
