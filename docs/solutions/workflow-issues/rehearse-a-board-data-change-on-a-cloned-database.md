---
title: Changing stored board data — rehearse on a pg_dump clone, write through the command API, replay the reviewed values
date: 2026-11-04
problem_type: workflow_issue
module: apps/server
severity: medium
tags: [production-data, backfill, yjs, hocuspocus, pg-dump, command-api, access-token, link-unfurl]
---

# Changing stored board data safely

**Situation.** The link-title backfill (`apps/server/src/scripts/backfill-link-titles.ts`) had to
change the production board, and the owner wanted to see every change before it landed. The same
approach fits any one-off edit of data inside the Yjs doc.

**Do not write the `bytea`.** `yjs_documents.state` looks like the obvious target, but a doc the
server holds in memory overwrites it on the next store. Go through
`POST /api/commands/:name`, which runs the command against the live Hocuspocus doc, persists it and
broadcasts it to open clients. A field-by-field diff of `exportBoard` before and after showed the
only side effect of `updateLinkTitle` is the owning card's `updatedAt`.

**Clone with `pg_dump`, not by copying the volume.** The prod Postgres publishes no host port and
keeps running, and a file copy of a live data directory can be torn. `pg_dump -Fc` piped from
`boardly-prod-db` into a new container on a new volume is consistent and read-only on prod. Prove
the copy with `md5(string_agg(md5(state), '' order by doc_name))` on both sides; the same query
later proves prod has not moved since the review.

**Auth on a clone needs no password; auth on prod does.** JWT signing keys are generated per process
(`apps/server/src/index.ts`), so a small launcher can boot the current server code against the clone
and sign a token with its own keys. That token gets a 401 from prod, which is the isolation check.
The same property means a prod token cannot be minted at all, since the keys exist only in the
running prod process: a real login is required.

**Replay the reviewed values; do not re-run the fetch.** Fetching is not repeatable. LinkedIn
resolved 29 links in one run and 30 in the next, minutes apart. Re-running the backfill on prod would
land something other than what was reviewed, so record the diff from the clone and write exactly
that, skipping any link whose title changed since the review.

**An old server can make live links look deleted.** The prod image lagged `main` by two months, and
its v1 `exportBoard` omits archived cards (109 cards against 191 on the clone), so a guard built on
that export reported 17 links as gone. The stored-doc checksum proved they were not. Verify such a
write the same way: restore a fresh prod dump into the clone and read it with current server code,
because the old export cannot see what you wrote.

**Gotchas.** The clone server's token, the prod server image and the script are three different
code ages: the prod image can lag `main`, so check `GET /api/commands` (no auth) for the commands you
need. Check a surprising result before calling it wrong: a "Wallet" card that gained an Android job
title was a mis-pasted link, confirmed by the slug LinkedIn redirects the job id to.
