# Migration baseline

The delivered `prisma/migrations` contains only incremental phase-2 migrations (they `ALTER` tables created in phase 1) and no initial migration, so `prisma migrate deploy` fails on an empty database.

Pick one:

- **Local development (simplest):** `pnpm exec prisma db push` creates the full schema from `schema.prisma`.
- **Proper migration history:** run `scripts/make-baseline.sh` once. It archives the four incremental migrations and generates a baseline from the current schema (which already includes their changes). Commit the result.

The search feature needs no schema change (vectors live in Chroma, Postgres stays the source of truth).
