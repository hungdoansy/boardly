// Server-side Yjs document name (must match the client's `@boardly/sync`
// `boardDocName` and the parser in `authz.ts`). The single content doc is keyed
// by the owning user's id: `board:<userId>`.
export const boardDocName = (userId: string): string => `board:${userId}`;
