// Shared Vitest setup, loaded by test projects that need a DOM and/or IndexedDB.
// - jest-dom extends `expect` with DOM matchers (used by UI tests).
// - fake-indexeddb/auto installs an in-memory `indexedDB` global so Yjs
//   persistence can be unit-tested without a real browser.
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
