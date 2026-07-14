import { describe, expect, it } from "vitest";

import { LinkProvider } from "../enums";
import {
  claudeResumeCommand,
  formatClaudeResumeUrl,
  parseClaudeResume,
  parseClaudeResumeUrl,
} from "./providers/claude-code";
import { detectProvider, isStorableLinkUrl, shortLabelFor } from "./registry";

const ID = "3d90b1bc-ada0-44c3-9ced-1be176c97044";

describe("parseClaudeResume", () => {
  it("accepts --resume, -r, and --resume= forms", () => {
    expect(parseClaudeResume(`claude --resume ${ID}`)).toBe(ID);
    expect(parseClaudeResume(`claude -r ${ID}`)).toBe(ID);
    expect(parseClaudeResume(`claude --resume=${ID}`)).toBe(ID);
  });

  it("is whitespace-tolerant and lowercases the id", () => {
    expect(parseClaudeResume(`  claude --resume   ${ID.toUpperCase()}  `)).toBe(ID);
  });

  it("returns null for non-commands (plain text, URLs, bare ids)", () => {
    expect(parseClaudeResume("just some notes")).toBeNull();
    expect(parseClaudeResume("https://example.com")).toBeNull();
    expect(parseClaudeResume(ID)).toBeNull();
    expect(parseClaudeResume("claude --resume not-a-uuid")).toBeNull();
    expect(parseClaudeResume("claude --help")).toBeNull();
  });
});

describe("claude-code URL helpers", () => {
  it("round-trips the id through the canonical URL", () => {
    const url = formatClaudeResumeUrl(ID);
    expect(url).toBe(`claude-code://resume/${ID}`);
    expect(parseClaudeResumeUrl(url)).toBe(ID);
  });

  it("builds the resume command", () => {
    expect(claudeResumeCommand(ID)).toBe(`claude --resume ${ID}`);
  });

  it("rejects a malformed session URL", () => {
    expect(parseClaudeResumeUrl("claude-code://resume/nope")).toBeNull();
  });
});

describe("registry integration", () => {
  it("detects the ClaudeCode provider and labels it", () => {
    const url = formatClaudeResumeUrl(ID);
    expect(detectProvider(url)).toBe(LinkProvider.ClaudeCode);
    expect(shortLabelFor(url)).toBe("Claude session 3d90b1bc");
  });

  it("does not shadow the claude.ai (Claude) provider", () => {
    expect(detectProvider("https://claude.ai/chat/abc")).toBe(LinkProvider.Claude);
  });

  it("isStorableLinkUrl accepts http(s) + claude-code, rejects unsafe schemes", () => {
    expect(isStorableLinkUrl("https://example.com")).toBe(true);
    expect(isStorableLinkUrl(formatClaudeResumeUrl(ID))).toBe(true);
    expect(isStorableLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isStorableLinkUrl("data:text/html,x")).toBe(false);
    expect(isStorableLinkUrl(`claude --resume ${ID}`)).toBe(false);
  });
});
