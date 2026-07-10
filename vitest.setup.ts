// Shared Vitest setup, loaded by test projects that need a DOM and/or IndexedDB.
// - jest-dom extends `expect` with DOM matchers (used by UI tests).
// - fake-indexeddb/auto installs an in-memory `indexedDB` global so Yjs
//   persistence can be unit-tested without a real browser.
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom lacks a few browser APIs that Radix/cmdk touch at mount time. Provide
// inert stand-ins so component tests can render dialogs/command menus.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
// Radix popovers/menus call these pointer-capture APIs on open; jsdom omits them.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false;
  };
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
}
