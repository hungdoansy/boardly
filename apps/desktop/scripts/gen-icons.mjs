// Regenerate the desktop icon set from the bare Boardly mark.
//
//   pnpm --filter @boardly/logo generate   # emits the icon-1024.png source
//   pnpm --filter @boardly/desktop icons    # this script
//
// `tauri icon` turns one square PNG into icon.icns (macOS), icon.ico (Windows),
// and the Linux/generic PNGs — all from the same bare, transparent mark, so the
// app icon is consistent across platforms. It also emits mobile + Microsoft-Store
// assets this desktop-only app never bundles; those are pruned to the exact set
// tauri.conf.json references. See docs/units/UNIT-16-logo-package.md.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(desktopDir, "src-tauri", "icons");
const src = join(
  desktopDir,
  "..",
  "..",
  "packages",
  "logo",
  "assets",
  "generated",
  "icon-1024.png",
);

// The only files tauri.conf.json's `bundle.icon` references — keep exactly these.
const KEEP = new Set(["32x32.png", "128x128.png", "128x128@2x.png", "icon.icns", "icon.ico"]);

if (!existsSync(src)) {
  console.error(
    `Missing brand source: ${src}\n` +
      "Run `pnpm --filter @boardly/logo generate` first to (re)build the mark rasters.",
  );
  process.exit(1);
}

console.log(`Generating desktop icons from ${src}`);
execFileSync("pnpm", ["exec", "tauri", "icon", src, "--output", iconsDir], {
  cwd: desktopDir,
  stdio: "inherit",
});

// Prune everything tauri emits beyond the shipped set (mobile dirs, MS-Store
// tiles, extra sizes) so the committed icons dir stays minimal.
let pruned = 0;
for (const entry of readdirSync(iconsDir)) {
  if (KEEP.has(entry)) continue;
  rmSync(join(iconsDir, entry), { recursive: true, force: true });
  pruned += 1;
}
console.log(`Pruned ${pruned} unused icon file(s)/dir(s); kept ${KEEP.size} referenced.`);
console.log("Done.");
