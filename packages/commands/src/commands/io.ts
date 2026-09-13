// Board import/export commands. `exportBoard` returns a full-fidelity snapshot
// of the caller's single per-user doc; `importBoard` applies one to that same
// doc in an explicitly chosen mode (validated by the shared domain schema, so
// REST/MCP callers validate identically to the UI).
//
// The agent surface is generated, not hand-written: `apps/server` emits
// `z.toJSONSchema(command.input)` per command and `apps/mcp` maps catalog
// entries one-to-one onto MCP tools. Whatever `importBoard.input` becomes *is*
// the MCP tool schema, which is why the mode being required (R22) and the
// Replace acknowledgement (KTD9) are schema decisions rather than UI ones.
import { ImportError, boardSnapshotSchema } from "@boardly/domain";
import { IMPORT_MODES, applySnapshot, boardToSnapshot } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

/** Re-exported so the REST layer can carry an import's own reason (R21) without depending on `@boardly/domain`. */
export { ImportError };

// The board id is the caller's user id (one doc per user).
const boardId = (ctx: { userId?: string; clientId: string }): string => ctx.userId ?? ctx.clientId;

/**
 * Per-mode risk language, attached with zod `.describe()` so it reaches the
 * generated REST and MCP schemas (KTD1, R24). This is also the **only** place a
 * caller learns that Replace needs `acknowledgeReplace`: JSON Schema cannot
 * express a conditional requirement, so a flat object plus `.refine()` emits the
 * field and drops the condition (KTD9).
 */
const MODE_DESCRIPTION = [
  "How the file meets the board. Required — there is no default, so a caller that omits it is",
  "rejected rather than silently getting a mode it did not choose.",
  '"replace": DESTRUCTIVE and not undoable. Deletes every card, project and label on the board —',
  "archived ones included — then loads the file, including its saved views. Also requires",
  "acknowledgeReplace: true. Applies to every signed-in device.",
  '"merge": non-destructive. Unions the file into the board by entity id and never deletes.',
  "A card the board edited more recently is skipped; a project or label whose name matches an",
  "active one on the board is folded into it, and the board's entity survives.",
  '"copy": non-destructive. Adds everything in the file under freshly generated ids, so nothing',
  "in the file can collide with anything already on the board.",
].join(" ");

const importInput = z
  .object({
    snapshot: boardSnapshotSchema,
    mode: z.enum(IMPORT_MODES).describe(MODE_DESCRIPTION),
    /**
     * A deliberateness control, not a security one: a caller holding the bearer
     * token can already loop `deleteCard`. What it prevents is an agent picking
     * the destructive mode by accident.
     */
    acknowledgeReplace: z
      .literal(true)
      .optional()
      .describe(
        'Required (and only meaningful) when mode is "replace". Confirms that deleting the board\'s existing content is intended.',
      ),
    /** Optional title override. Only `replace` writes board identity, so only it uses this. */
    title: z.string().min(1).optional(),
  })
  .refine((input) => input.mode !== "replace" || input.acknowledgeReplace === true, {
    message: 'mode "replace" requires acknowledgeReplace: true',
    path: ["acknowledgeReplace"],
  });

export const exportBoard = defineCommand({
  name: "exportBoard",
  description:
    "Export the board as a full-fidelity snapshot: board settings and display preferences, every project, the label palette, saved views, and every card — archived ones included — with its project, labels, checklist, links and relations.",
  input: z.object({}),
  run: (ctx) => boardToSnapshot(ctx.getBoardDoc(), boardId(ctx)),
});

export const importBoard = defineCommand({
  name: "importBoard",
  description:
    "Apply a board snapshot to the board in one of three modes: replace (destructive), merge (union, never deletes), or copy (everything under fresh ids). Returns what the import actually did: per-entity created/updated/skipped counts, name fusions, cards skipped as stale, and references that resolved to nothing. Either the whole import lands or none of it does.",
  input: importInput,
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    try {
      return applySnapshot(doc, input.snapshot, {
        mode: input.mode,
        now: ctx.now(),
        clientId: ctx.clientId,
        ...(ctx.userId === undefined ? {} : { userId: ctx.userId }),
        ...(input.title === undefined ? {} : { title: input.title }),
      });
    } catch (error) {
      if (error instanceof ImportError) throw error;
      // The apply is staged, so a throw means nothing was written. Say so:
      // a destructive call that fails with no reason invites a retry (R21).
      throw new ImportError(
        `import (${input.mode}) failed and the board was not changed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
});
