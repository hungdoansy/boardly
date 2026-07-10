// Full-fidelity JSON import/export. Export is a stable, pretty-printed snapshot;
// import validates with the zod schema and throws `ImportError` (atomic — a
// malformed file yields nothing, never a partial board).
import { type BoardSnapshot, ImportError, SNAPSHOT_VERSION, boardSnapshotSchema } from "./snapshot";

/** Serialize a board snapshot to pretty JSON. */
export function exportJson(snapshot: BoardSnapshot): string {
  return JSON.stringify({ ...snapshot, version: SNAPSHOT_VERSION }, null, 2);
}

/** Parse + validate a JSON board file. Throws `ImportError` on any problem. */
export function parseJson(text: string): BoardSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("File is not valid JSON.");
  }
  const result = boardSnapshotSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "(root)";
    throw new ImportError(`Invalid board file at ${path}: ${issue?.message ?? "unknown error"}`);
  }
  return result.data;
}
