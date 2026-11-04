#!/usr/bin/env node
// Build changelog entries for a release. Pulls recent commits via git, optionally
// polishes them with Gemini, and writes the result to GITHUB_OUTPUT (key: `text`)
// and GITHUB_STEP_SUMMARY.
//
// Env:
//   TAG                  e.g. v2.3.0 (required for summary header)
//   GEMINI_API_KEY       optional; falls back to the raw git log when missing
//   GEMINI_MODEL         optional; defaults to gemini-3.5-flash
//   GITHUB_OUTPUT        provided by the runner
//   GITHUB_STEP_SUMMARY  provided by the runner
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const TAG = process.env.TAG || "";
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT || "";
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY || "";

/** Commit types a user of the app never notices. */
const INTERNAL_COMMIT = /^(release|docs|test|chore|ci|build|style|refactor)(\(.+?\))?!?:/;

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trimEnd();
}

/** Turn commit subjects into `- ` lines, minus internal commits and repo bookkeeping. */
export function formatEntries(subjects) {
  const lines = subjects
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !INTERNAL_COMMIT.test(l))
    // Strip conventional-commit prefixes: "feat: ", "fix(foo): ", etc.
    .map((l) => l.replace(/^[a-z]+(\(.+?\))?!?:\s*/, ""))
    // Strip trailing unit and PR references: "... (UNIT-3.7) (#9)".
    .map((l) => l.replace(/(\s*\((UNIT-[^)]*|#\d+)\))+$/, ""))
    .map((l) => `- ${l}`);
  return lines.length ? lines.join("\n") : "- No notable changes";
}

function buildRawEntries() {
  const lastTag = sh("git tag -l 'v*' --sort=-v:refname").split("\n")[0];

  const format = ["--pretty=tformat:%s", "--no-merges"];
  const args = lastTag ? [`${lastTag}..HEAD`, ...format] : [...format, "-20"];
  const log = sh(`git log ${args.join(" ")}`);

  return { lastTag, entries: formatEntries(log.split("\n")) };
}

async function polishWithGemini(raw) {
  const prompt = [
    "You are a release notes writer. Given a list of git commit messages, rewrite them as concise, user-facing release notes.",
    "Use bullet points starting with '- '. Focus on what changed from the user's perspective.",
    "Remove implementation details. Fix grammar. Do not add a version header, just the bullet points.",
    "",
    "Commits:",
    raw,
  ].join("\n");

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${bodyText.slice(0, 800)}`);
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`Non-JSON response: ${bodyText.slice(0, 500)}`);
  }

  const polished = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!polished) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      `No text in response (finishReason=${finishReason ?? "unknown"}): ${JSON.stringify(data).slice(0, 500)}`,
    );
  }
  return polished;
}

function writeOutput(name, value) {
  if (!GITHUB_OUTPUT) return;
  const marker = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(GITHUB_OUTPUT, `${name}<<${marker}\n${value}\n${marker}\n`);
}

function writeSummary(text) {
  if (!GITHUB_STEP_SUMMARY) return;
  appendFileSync(GITHUB_STEP_SUMMARY, text);
}

async function main() {
  const { lastTag, entries: raw } = buildRawEntries();
  console.log(`Last tag: ${lastTag || "(none)"}`);
  console.log(`Raw commits:\n${raw}\n`);

  let entries = raw;
  let geminiStatus;

  if (!GEMINI_API_KEY) {
    geminiStatus = "GEMINI_API_KEY not set, using raw git log";
    console.warn(`::warning::${geminiStatus}`);
  } else {
    try {
      entries = await polishWithGemini(raw);
      geminiStatus = `Successfully fetched changelog from Gemini (model: ${GEMINI_MODEL})`;
      console.log(geminiStatus);
    } catch (err) {
      // The response body stays in the step log: annotations and the run summary
      // show on the run page, where a raw API error reads like a failed release.
      console.log(`Gemini request failed: ${err.message}`);
      geminiStatus = `Gemini unavailable (model: ${GEMINI_MODEL}), using raw git log`;
      console.warn(`::warning::${geminiStatus}`);
    }
  }

  writeOutput("text", entries);
  writeSummary(
    [
      `## Release ${TAG}`,
      ``,
      `**Gemini status:** ${geminiStatus}`,
      ``,
      `### Changelog`,
      ``,
      entries,
      ``,
    ].join("\n"),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
