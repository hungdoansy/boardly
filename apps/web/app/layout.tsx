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
};

// Applied before first paint to avoid a theme flash: read the persisted choice
// (or the OS preference) and stamp `.dark`/`.light` on <html>. Dark is the SSR
// default; this only switches light-preferring users. Keep in sync with
// `lib/theme.ts`.
const THEME_INIT = `(function(){try{var k='boardly-theme';var t=localStorage.getItem(k);if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';}var e=document.documentElement;e.classList.remove('dark','light');e.classList.add(t);e.style.colorScheme=t;}catch(_){}})();`;

// Stamp the persisted focus level onto <html> before first paint so the board
// doesn't flash full-color then mute. Keep in sync with `lib/focus-mode.ts`.
const FOCUS_INIT = `(function(){try{var f=localStorage.getItem('boardly-focus');if(f==='calm'||f==='zen'){document.documentElement.setAttribute('data-focus',f);}}catch(_){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  // `.dark` is the SSR default (dark is the priority theme). The inline script
  // corrects to light before paint when the user/OS prefers it (Unit 5.3).
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: FOCUS_INIT }} />
        {children}
      </body>
    </html>
  );
}
