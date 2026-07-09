// A command is the single, typed, zod-validated unit of every board/card
// mutation or query. The UI, REST API, and MCP server all `execute` the same
// commands — only the CommandContext differs — so the agent surface cannot
// drift from the UI (agent-native parity, plan R13).
import type { z } from "zod";

import type { CommandContext } from "./context";

export interface Command<S extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  description: string;
  input: S;
  // Method syntax (bivariant) so specific commands are assignable to `Command`.
  run(ctx: CommandContext, input: z.infer<S>): O;
}

export function defineCommand<S extends z.ZodType, O>(command: Command<S, O>): Command<S, O> {
  return command;
}

/** Validate raw input against the command's schema, then run it. Throws ZodError on invalid input. */
export function execute<S extends z.ZodType, O>(
  command: Command<S, O>,
  ctx: CommandContext,
  rawInput: unknown,
): O {
  const input = command.input.parse(rawInput);
  return command.run(ctx, input);
}
