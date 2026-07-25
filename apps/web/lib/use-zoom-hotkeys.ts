"use client";

// Whole-app zoom keyboard shortcuts (UNIT-15): ⌘/Ctrl + zoom in, ⌘/Ctrl −
// zoom out, ⌘/Ctrl 0 reset. Works identically in the web app and the Tauri
// desktop webview — the desktop menu binds no zoom accelerator, so these
// keydowns reach JS on both. This is a SEPARATE listener from
// `useGlobalKeyboard` (which deliberately bails on ⌘/Ctrl chords so field- and
// browser-level shortcuts pass through); zoom is precisely the chord case.
//
// `preventDefault` is mandatory: in the web browser it suppresses the browser's
// own native zoom, so ⌘+ zooms exactly one app step instead of double-zooming.

import { DEFAULT_ZOOM, zoomIn, zoomOut } from "@boardly/domain";
import { useEffect, useRef } from "react";

/**
 * Install the zoom shortcuts on `window`. `zoom` is the current factor;
 * `setZoom` persists the next one (the synced `setZoom` command). The listener
 * is installed once and reads the latest `zoom`/`setZoom` via refs, so it never
 * re-binds on every zoom change.
 */
export function useZoomHotkeys(zoom: number, setZoom: (factor: number) => void): void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setRef = useRef(setZoom);
  setRef.current = setZoom;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Only the ⌘/Ctrl chord, and never with Alt (leave other chords alone).
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      switch (e.key) {
        case "=":
        case "+":
          e.preventDefault();
          setRef.current(zoomIn(zoomRef.current));
          break;
        case "-":
        case "_":
          e.preventDefault();
          setRef.current(zoomOut(zoomRef.current));
          break;
        case "0":
          e.preventDefault();
          setRef.current(DEFAULT_ZOOM);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
