# Contributing / developer guide

## Setup
Follow "Quick start" in `README.md`. Node ≥ 20.18 and pnpm 9 are required.

## Before you open a PR
```bash
pnpm --filter @ash/api typecheck && pnpm --filter @ash/web typecheck
pnpm --filter @ash/api test && pnpm --filter @ash/web test
pnpm --filter @ash/api test:int      # needs Postgres + Redis, wipes the DB
pnpm --filter @ash/web e2e           # needs running API + web + seeded DB
```

## Conventions
- TypeScript everywhere; validate every API input with Zod; money in integer paise.
- New API feature = new folder in `apps/api/src/modules/<name>/` with `<name>.routes.ts`, mounted in `app.ts`, plus an integration test in `apps/api/test/integration/`.
- Never trust the client for prices, ownership or roles; enforce on the server and add a test that another user gets 404/403.
- Schema changes: edit `prisma/schema.prisma` and add a SQL migration in `prisma/migrations/` (see `prisma/BASELINE.md`).
- Web pages are App Router; client pages call the API through `lib/api.ts` (handles refresh and CSRF). Keep text contrast accessible (use `text-white/60` or brighter on the dark background).
- Do not change the exploded-view behaviour of the 3D watch without reading `docs/3D-WATCH.md`.
- Secrets never go in git: `.env` is ignored, `.env.example` lists every variable.

## Where to read next
`docs/README.md` is the index of all documentation.
