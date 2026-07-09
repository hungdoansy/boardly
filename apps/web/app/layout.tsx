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

export default function RootLayout({ children }: { children: ReactNode }) {
  // `dark` class + color-scheme on :root; dark is the default/only theme until
  // the light-theme polish pass (Unit 5.3).
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
