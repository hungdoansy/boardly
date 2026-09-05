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
  // A file from a newer build is rejected outright rather than read
  // best-effort (R3): zod strips keys it does not know *silently*, so a
  // partial read would drop whole sections the newer writer added — the exact
  // failure mode that made this format need a version gate in the first place.
  // An older file is fine: v2 defaults stand in for the sections it predates.
  if (result.data.version > SNAPSHOT_VERSION) {
    throw new ImportError(
      `This board file was written by a newer version of Boardly (file format ${result.data.version}; this build reads up to ${SNAPSHOT_VERSION}). Update Boardly to import it.`,
    );
  }
  return result.data;
}
