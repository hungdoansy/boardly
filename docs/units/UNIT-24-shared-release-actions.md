# UNIT-24: Shared release actions

Moves the release steps that are the same in every app out of this repo and into
`hungdoansy/desktop-release-actions`, a public repo of composite actions. nodl and messy use the same
actions. Plan: `docs/plans/2026-11-04-1205-refactor-shared-release-actions-plan.md`.

## What changed

- `.github/workflows/release.yml` calls four shared actions at `@v1` in place of its own steps.
- Added a `dry_run` checkbox to the workflow.
- Write access moved from the whole workflow to the `release` job only. `prepare` and `build`
  checkouts no longer keep a token (`persist-credentials: false`).
- The four build targets moved from `resolve-targets.mjs` into `select-build-targets`. The workflow
  lists only their ids, which are also the checkbox names.
- Deleted `scripts/release/generate-changelog.mjs`, `prepend-changelog.mjs` and
  `resolve-targets.mjs`, and their tests. The tests now live in the shared repo.
- `scripts/release/set-version.mjs` stays, because it knows this repo's Tauri files.
- Every app calls one Gemini URL, `/v1/models/gemini-3.6-flash:generateContent`, set in the shared
  action. The workflow passes only the secret, and there is no model or API version input.

No product source changed, and no dependency was added.

## How it works

| Job       | Shared action              | What it does                                                   |
| --------- | -------------------------- | -------------------------------------------------------------- |
| `prepare` | `validate-and-draft-notes` | Checks the version and tag, then drafts notes with Gemini      |
| `prepare` | `select-build-targets`     | Turns the ticked checkboxes into the build matrix              |
| `release` | `prepend-changelog-entry`  | Adds the release block to `apps/desktop/CHANGELOG.md`          |
| `release` | `tag-and-publish-release`  | Commits, tags, pushes both at once, creates the GitHub Release |

Lint, typecheck, test, the Tauri build, signing and version stamping stay in this repo.

### Dry run

Tick **Dry run** in the run dialog. The run builds everything, commits and tags on the runner, and
pushes nothing. The run summary shows the installers it found, the notes and the release commit's
patch. The delete-artifacts step is skipped, so the installers can be downloaded for a day.

### Turning a build on or off

Tick a checkbox for one run, or change its `default` in `release.yml` for every run. See the target
table in `docs/units/UNIT-23-release-pipeline.md`.

## Why

- **Composite actions, not reusable workflows.** A composite action ships its own scripts, so the
  logic exists once. A reusable workflow runs in the caller's checkout and owns whole jobs, which
  fits badly with a build job that differs per repo.
- **`@v1` moves.** A fix to the commit filter or fallback reaches every app with no edit here. The
  repo's rulesets block changes to fixed `v1.x.y` tags, and `v1` only moves to a commit that has one.
- **The old scripts' behavior is preserved.** The new filter and changelog insert were run over this
  repo's 207 commit subjects and its real changelog, and matched the old scripts exactly.

### Behavior changes from UNIT-23

- Notes are drafted at the start of `prepare`, before lint and tests. A failed test now costs one
  unused Gemini request.
- `main` and the tag push in one atomic update, so one cannot land without the other.
- Bad asset globs stop the run before the push. A run with no assets at all also stops.
- Gemini is skipped when no commits survive the filter, and the notes read `- No notable changes`.
- Gemini requests time out after 30 seconds. The step log shows only the status, never the response
  body.

## How to test

```bash
pnpm exec vitest run --project scripts
```

The action tests run in the shared repo with `node --test`.

The end-to-end check is a dry run from the Actions tab. With no `feat:` or `fix:` commit since the
last tag, the expected notes are `- No notable changes`.

## Follow-ups / known gaps

- **Not run on GitHub yet.** The workflow needs the shared repo published and `v1` tagged first.
- **The GitHub Release step only runs in a real release,** so the first real release is its final
  proof. If it fails after the push, create the release by hand from the tag, using the build
  artifacts within their one-day retention.
- **`gemini-3.6-flash` is not proved yet.** The dry run had no notable commits, so it skipped
  Gemini. If the model fails, the notes fall back to the commit list and the run shows a warning.
- **`softprops/action-gh-release` stays on v2** for this move. The bump to v3, and clearing the Node
  20 annotations, is a separate `v1.x` change.
