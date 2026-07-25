import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Boardly",
  description: "Fast, offline-first, keyboard-driven kanban.",
  // Served from apps/web/public/logo, copied there from @boardly/logo by
  // scripts/sync-logo.mjs on dev/build (the folder is git-ignored).
  icons: {
    icon: [
      { url: "/logo/favicon.svg", type: "image/svg+xml" },
      { url: "/logo/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/logo/apple-touch-icon.png",
  },
};

// Applied before first paint to avoid a theme flash: read the persisted choice
// (or the OS preference) and stamp `.dark`/`.light` on <html>. Dark is the SSR
// default; this only switches light-preferring users. Keep in sync with
// `lib/theme.ts`.
const THEME_INIT = `(function(){try{var k='boardly-theme';var t=localStorage.getItem(k);if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}var e=document.documentElement;e.classList.remove('dark','light');e.classList.add(t);e.style.colorScheme=t;}catch(_){}})();`;

// Stamp the persisted focus level onto <html> before first paint so the board
// doesn't flash full-color then mute. Keep in sync with `lib/focus-mode.ts`.
const FOCUS_INIT = `(function(){try{var f=localStorage.getItem('boardly-focus');if(f==='calm'||f==='zen'){document.documentElement.setAttribute('data-focus',f);}}catch(_){}})();`;

// Apply the device-cached whole-app zoom before first paint so the UI doesn't
// flash 100% then jump to the persisted level. WEB ONLY: on desktop the native
// webview zoom is the lever (see `lib/zoom.ts`), so we must NOT stamp the CSS var
// here — doing so would briefly double-zoom (CSS + native) until hydration. We
// detect Tauri the same way `platform.ts` does (`__TAURI_INTERNALS__`/`__TAURI__`,
// injected before this script runs). The synced board-meta value re-applies after
// hydration. Clamped to [0.5, 2]. Keep in sync with `lib/zoom.ts`.
const ZOOM_INIT = `(function(){try{if('__TAURI_INTERNALS__' in window||'__TAURI__' in window)return;var z=parseFloat(localStorage.getItem('boardly-zoom'));if(isFinite(z)){z=Math.min(2,Math.max(0.5,z));document.documentElement.style.setProperty('--app-zoom',String(z));}}catch(_){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  // `.dark` is the SSR default (dark is the priority theme). The inline script
  // corrects to light before paint when the user/OS prefers it (Unit 5.3).
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: FOCUS_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: ZOOM_INIT }} />
        {children}
      </body>
    </html>
  );
}
