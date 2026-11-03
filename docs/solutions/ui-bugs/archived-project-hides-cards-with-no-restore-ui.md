---
title: "Data looks erased" was an archived project hiding its cards, and the UI has no way to restore it
date: 2026-10-14
problem_type: ui_bug
module: packages/sync, packages/commands, apps/web
severity: high
tags:
  [
    archive-project,
    hidden-cards,
    unarchive-project,
    missing-restore-ui,
    production-data,
    yjs-inspection,
    perceived-data-loss,
  ]
---

**Symptom.** On the local production desktop app, cards appeared to be gone ("my data was erased,
or I'm in the wrong account").

**What it actually was.** Nothing had been lost. Production (`boardly-prod-db`) had exactly one user,
and the desktop app had logged in as that user. The single `board:<userId>` doc still held 183
cards, 101 of them live. Two projects (Moonbase, OBSDN) had `archived: true` plus `deletedAt`, set by
`archiveProject` (`packages/sync/src/board-doc.ts:1007`). Their 30 live cards were still live, but
nothing renders the cards of an archived project, so they disappeared from every view.

**Root cause: a one-way action.** `unarchiveProject` exists in sync
(`packages/sync/src/board-doc.ts:1014`) and is exposed as a command
(`packages/commands/src/commands/project.ts`, "Restore a hidden (archived) project"). No component in
`apps/web` calls it. Hiding a project can't be undone from the UI, and it reads as data loss, because
the cards themselves are never archived. You can't even find them in the archived-cards list.

**Gotcha: rule out "wrong account / wrong server" from the data, not from the UI.**

- `refresh_tokens.created_at` for the user, compared with the mtime of
  `~/Library/Application Support/vn.moonbase.boardly/auth-store.json`, shows which server and account
  the desktop app logged in to most recently.
- The webview's IndexedDB lives under `~/Library/WebKit/vn.moonbase.boardly/WebsiteData/Default/…/IndexedDB/`.
  `IDBDatabaseInfo.DatabaseName` is UTF-16LE (decode it via `hex()` + `iconv`) and names the cached
  doc (`boardly:board:<userId>`). Querying `Records` directly fails with `no such collation sequence: IDBKEY`, so
  stick to aggregate queries like `group by objectStoreID`. Copy the files out before you read them.
- To read the board itself, pull `yjs_documents.state` as base64 with `docker exec boardly-prod-db psql`
  (the prod db publishes no host port), `Y.applyUpdate` it into a doc with `yjs` resolved from
  `packages/sync`, and `toJSON()` the `projects` and `cards` maps. Archived projects that still hold
  live cards are the first thing to check.

**Resolution / follow-up.** You can restore a project by running `unarchiveProject` against the
user's doc. The real fix is a restore entry point in the UI: a hidden-projects list next to the
archived-cards view.
