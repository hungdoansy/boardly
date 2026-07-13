// The single registry of every command. REST (Unit 3.9) and MCP (Unit 3.10)
// enumerate this and derive their schemas from each command's zod `input`, so
// the agent surface is generated from — and cannot drift from — the UI's.
import type { Command } from "./command";
import { renameBoard, setBadgeConfig, setShowEmptyColumns, setTicketPrefix } from "./commands/board";
import {
  addChecklistItem,
  addRelatedCard,
  archiveCard,
  createCard,
  deleteCard,
  deleteChecklistItem,
  getCard,
  moveCard,
  moveChecklistItem,
  removeRelatedCard,
  renameCard,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setChecklistItemText,
  toggleChecklistItem,
} from "./commands/card";
import {
  assignLabel,
  createLabel,
  deleteLabel,
  recolorLabel,
  renameLabel,
  unassignLabel,
} from "./commands/label";
import { exportBoard, importBoard } from "./commands/io";
import { addLink, moveLink, removeLink } from "./commands/link";
import {
  archiveProject,
  createProject,
  listProjectsCommand,
  recolorProject,
  renameProject,
  setCardProject,
} from "./commands/project";
import { searchCards } from "./commands/search";
import { setCardStatus } from "./commands/status";
import { deleteView, saveView } from "./commands/view";

export const commands = [
  renameBoard,
  setBadgeConfig,
  setTicketPrefix,
  setShowEmptyColumns,
  createCard,
  moveCard,
  renameCard,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  archiveCard,
  deleteCard,
  getCard,
  addChecklistItem,
  toggleChecklistItem,
  setChecklistItemText,
  deleteChecklistItem,
  moveChecklistItem,
  addRelatedCard,
  removeRelatedCard,
  setCardStatus,
  createLabel,
  renameLabel,
  recolorLabel,
  deleteLabel,
  assignLabel,
  unassignLabel,
  addLink,
  removeLink,
  moveLink,
  createProject,
  renameProject,
  recolorProject,
  archiveProject,
  listProjectsCommand,
  setCardProject,
  searchCards,
  saveView,
  deleteView,
  exportBoard,
  importBoard,
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
