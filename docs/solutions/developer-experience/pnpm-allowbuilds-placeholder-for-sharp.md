---
title: pnpm rewrites pnpm-workspace.yaml with an allowBuilds placeholder for sharp
date: 2026-09-13
problem_type: developer_experience
module: pnpm-workspace.yaml, packages/logo
severity: low
tags: [pnpm, sharp, esbuild, install, build-scripts, workspace-config]
---

A `pnpm install` can leave the working tree dirty with a single line nobody wrote:

```yaml
allowBuilds:
  esbuild: true
  sharp: set this to true or false
```

That value is not config — it is a fill-in-the-blank prompt pnpm 11 appends for each dependency
whose build (postinstall) script it declined to run. `sharp` is pulled in as a devDependency of
`packages/logo`, ships a native postinstall, and is not on the repo's `onlyBuiltDependencies`
allow-list, so pnpm asks. Left as-is it is invalid YAML-as-config, and every fresh install ends
with `ERR_PNPM_IGNORED_BUILDS: sharp@<v>`, which reads like a failure and is not.

**The answer is `sharp: false`, not deletion and not `true`.**

- `false` is correct on the merits: sharp's prebuilt binary loads fine without its build script
  (verified — `require("sharp")` reports libvips 8.18.3), and its only consumer is
  `pnpm logo:generate`, whose outputs are committed. Nothing in the web bundle or the Tauri build
  touches it. `docs/solutions/documentation-gaps/local-production-prereqs-assumed-present.md`
  already warns that the `ERR_PNPM_IGNORED_BUILDS` notice is expected and must not be "fixed" by
  approving the build script.
- Deleting the line does not stick. `docs/units/UNIT-3.10-mcp-server.md` records removing this same
  placeholder once before, noting pnpm "kept re-adding" it. An unanswered question gets re-asked;
  `false` is an answer, so pnpm stops asking. Confirmed: two consecutive installs after the change
  leave the file untouched and exit 0.

`allowBuilds` (the map, pnpm's newer surface) and `onlyBuiltDependencies` (the legacy array) coexist
here. `esbuild` stays in both because `tsx` and `drizzle-kit` genuinely need its platform binary
installed post-download. Do not migrate one to the other casually — `verifyDepsBeforeRun: false` is
in the same file precisely because a re-run install that exits non-zero on a build notice broke
every `pnpm --filter <pkg> <script>` invocation.

**General shape:** when a tool writes a placeholder into a tracked config file, the fix is to answer
it in place, not to revert the file. A reverted prompt comes back on the next run; a recorded
decision does not.
