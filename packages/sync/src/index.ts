// @boardly/sync — Yjs schema and typed accessors (pure: yjs + domain only, no
// DOM). Browser-only persistence/provider live at `@boardly/sync/client`, and
// the React binding at `@boardly/sync/react`, so non-browser consumers (the
// command layer, the server) never pull IndexedDB/React into their graph.
export * from "./schema";
export * from "./board-doc";
