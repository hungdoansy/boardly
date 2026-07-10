"use client";

import { useSyncExternalStore } from "react";

// Theme resolution + persistence (Unit 5.3). Dark is the priority/default.
// A manual choice ("dark"/"light") is persisted; "system" follows
// prefers-color-scheme. The resolved theme is stamped as a class on <html>
// (`.dark` / `.light`) which the token layer keys off. A no-FOUC inline script
// (see app/layout.tsx) applies the same logic before first paint.
export type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "boardly-theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function systemPrefersLight(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(LIGHT_QUERY).matches
  );
}

/** Pure: the concrete theme for a preference given the OS preference. */
export function resolveTheme(pref: ThemePreference, prefersLight: boolean): Theme {
  if (pref === "system") return prefersLight ? "light" : "dark";
  return pref;
}

function readPreference(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : "system";
}

/** Stamp the resolved theme onto <html> (class + color-scheme). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("dark", "light");
  el.classList.add(theme);
  el.style.colorScheme = theme;
}

let preference: ThemePreference = readPreference();
const listeners = new Set<() => void>();
let snapshot: { preference: ThemePreference; theme: Theme } = {
  preference,
  theme: resolveTheme(preference, systemPrefersLight()),
};

function recompute(): void {
  snapshot = { preference, theme: resolveTheme(preference, systemPrefersLight()) };
}

/** Set (and persist) the theme preference, apply it, and notify subscribers. */
export function setThemePreference(pref: ThemePreference): void {
  preference = pref;
  if (typeof localStorage !== "undefined") localStorage.setItem(THEME_STORAGE_KEY, pref);
  recompute();
  applyTheme(snapshot.theme);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Track OS changes so a "system" preference live-updates.
  const mql =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(LIGHT_QUERY)
      : null;
  const onSystem = (): void => {
    if (preference !== "system") return;
    recompute();
    applyTheme(snapshot.theme);
    listener();
  };
  mql?.addEventListener("change", onSystem);
  return () => {
    listeners.delete(listener);
    mql?.removeEventListener("change", onSystem);
  };
}

const SERVER_SNAPSHOT = { preference: "system" as ThemePreference, theme: "dark" as Theme };

export interface UseThemeResult {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (pref: ThemePreference) => void;
  /** Flip between explicit dark/light (a manual, persisted choice). */
  toggle: () => void;
}

export function useTheme(): UseThemeResult {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
  return {
    preference: state.preference,
    theme: state.theme,
    setPreference: setThemePreference,
    toggle: () => setThemePreference(state.theme === "dark" ? "light" : "dark"),
  };
}
