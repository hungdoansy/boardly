// Server-side Yjs document names (must match the client's `@boardly/sync`
// `boardDocName`/`workspaceDocName` and the parser in `authz.ts`).
export const boardDocName = (boardId: string): string => `board:${boardId}`;
export const workspaceDocName = (userId: string): string => `workspace:${userId}`;
