# Boardly sync/API server image.
#
# Single stage on the pinned Node (CLAUDE.md §4). We run the server with `tsx`
# straight from TypeScript (`pnpm start` = `tsx src/index.ts`) — no compile step
# — and Drizzle migrations run at boot from `apps/server/drizzle`
# (`src/db/migrate.ts`), so the container is self-migrating.
#
# IMPORTANT: NODE_ENV is intentionally NOT set to `production` here. pnpm would
# then skip devDependencies and drop `tsx` (the runtime). NODE_ENV=production is
# supplied at *run* time by docker-compose, after `tsx` is already installed.
FROM node:22.17.1-slim

# pnpm, pinned to match `packageManager` in package.json.
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

WORKDIR /app

# Copy the whole monorepo (the .dockerignore keeps this to source + manifests).
# The server depends on workspace packages (@boardly/commands → domain, sync),
# so the whole workspace is present for pnpm to resolve links.
COPY . .

# Install ONLY the server's dependency subtree (`@boardly/server` + the
# workspace packages it depends on). This deliberately excludes the web app's
# deps — notably `sharp`, whose ignored build script makes a full-workspace
# `pnpm install` exit non-zero under pnpm 11 (and sharp isn't needed: the web
# build is a static export with unoptimized images). Filtering also keeps the
# image small. `onlyBuiltDependencies` (pnpm-workspace.yaml) allow-lists esbuild
# so tsx's native binary still builds.
RUN pnpm install --frozen-lockfile --filter "@boardly/server..."

WORKDIR /app/apps/server

EXPOSE 8787

# `pnpm start` → tsx src/index.ts: runs migrations, then Fastify + Hocuspocus.
CMD ["pnpm", "start"]
