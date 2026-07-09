// The single registry of every command. REST (Unit 3.9) and MCP (Unit 3.10)
// enumerate this and derive their schemas from each command's zod `input`, so
// the agent surface is generated from — and cannot drift from — the UI's.
import type { Command } from "./command";
import { archiveBoard, createBoard, listBoards, renameBoard } from "./commands/board";
import {
  archiveCard,
  createCard,
  getCard,
  moveCard,
  renameCard,
  setCardDescription,
  setCardPriority,
  setCardSeverity,
} from "./commands/card";
import { addColumn, archiveColumn, moveColumn, renameColumn } from "./commands/column";
import {
  assignLabel,
  createLabel,
  deleteLabel,
  recolorLabel,
  renameLabel,
  unassignLabel,
} from "./commands/label";
import { addLink, removeLink } from "./commands/link";
import { searchCards } from "./commands/search";
import { setCardStatus } from "./commands/status";

export const commands = [
  createBoard,
  renameBoard,
  archiveBoard,
  listBoards,
  addColumn,
  renameColumn,
  moveColumn,
  archiveColumn,
  createCard,
  moveCard,
  renameCard,
  setCardDescription,
  setCardPriority,
  setCardSeverity,
  archiveCard,
  getCard,
  setCardStatus,
  createLabel,
  renameLabel,
  recolorLabel,
  deleteLabel,
  assignLabel,
  unassignLabel,
  addLink,
  removeLink,
  searchCards,
] satisfies Command[];

export const catalog: Record<string, Command> = Object.fromEntries(
  commands.map((command) => [command.name, command]),
);

export function getCommand(name: string): Command | undefined {
  return catalog[name];
}

export function listCommandNames(): string[] {
  return commands.map((command) => command.name);
}
