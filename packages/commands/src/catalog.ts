// The single registry of every command. REST (Unit 3.9) and MCP (Unit 3.10)
// enumerate this and derive their schemas from each command's zod `input`, so
// the agent surface is generated from — and cannot drift from — the UI's.
import type { Command } from "./command";
import {
  archiveBoard,
  createBoard,
  listBoards,
  renameBoard,
  setBadgeConfig,
} from "./commands/board";
import {
  addChecklistItem,
  archiveCard,
  createCard,
  deleteChecklistItem,
  getCard,
  moveCard,
  moveChecklistItem,
  renameCard,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
  setChecklistItemText,
  toggleChecklistItem,
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
import { deleteView, saveView } from "./commands/view";

export const commands = [
  createBoard,
  renameBoard,
  archiveBoard,
  setBadgeConfig,
  listBoards,
  addColumn,
  renameColumn,
  moveColumn,
  archiveColumn,
  createCard,
  moveCard,
  renameCard,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
  archiveCard,
  getCard,
  addChecklistItem,
  toggleChecklistItem,
  setChecklistItemText,
  deleteChecklistItem,
  moveChecklistItem,
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
  saveView,
  deleteView,
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
