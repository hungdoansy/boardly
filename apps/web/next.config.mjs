/** @type {import("next").NextConfig} */
const nextConfig = {
  // Static SPA export — the same `out/` is deployed to the web and wrapped by
  // Tauri. Bans server actions / route handlers / ISR / next/image loader, etc.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The board route is resolved client-side from the URL (no per-id prerender),
  // so unknown /board?id=… paths are served by the SPA fallback (Unit 1.3+).
};

export default nextConfig;
