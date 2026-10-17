#!/usr/bin/env bash
# One-time: create a baseline migration from prisma/schema.prisma so `prisma migrate deploy` works on an EMPTY database.
# The four incremental phase-2 migrations only ALTER tables that a phase-1 baseline created; schema.prisma already contains
# all of their changes, so they are replaced by the baseline.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p prisma/migrations_phase2_archive
mv prisma/migrations/2026* prisma/migrations_phase2_archive/ 2>/dev/null || true
mkdir -p prisma/migrations/00000000000000_baseline
pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/00000000000000_baseline/migration.sql
echo "Baseline written. Review prisma/migrations/00000000000000_baseline/migration.sql, then:"
echo "  fresh DB:    pnpm db:deploy"
echo "  existing DB: pnpm exec prisma migrate resolve --applied 00000000000000_baseline"
