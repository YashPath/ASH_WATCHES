-- PostgreSQL type evidence aligned to Phase 1 Prisma declarations:
-- String @db.Uuid => UUID; Int => INTEGER; String @db.VarChar(n) => VARCHAR(n).
-- The order locking query uses ${variantId}::uuid and selects stockQuantity/price as INTEGER.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "manualReviewRequired" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "RefreshToken"
  ADD COLUMN IF NOT EXISTS "mfaAuthenticated" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  CREATE TYPE "EmailActionType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'GLB');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProcessedStripeEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId" VARCHAR(255) NOT NULL UNIQUE,
  "eventType" VARCHAR(120) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProcessedStripeEvent_eventType_createdAt_idx"
  ON "ProcessedStripeEvent"("eventType", "createdAt");

CREATE TABLE IF NOT EXISTS "EmailActionToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" "EmailActionType" NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmailActionToken_userId_type_expiresAt_idx"
  ON "EmailActionToken"("userId", "type", "expiresAt");
CREATE INDEX IF NOT EXISTS "EmailActionToken_expiresAt_idx" ON "EmailActionToken"("expiresAt");

CREATE TABLE IF NOT EXISTS "MediaAsset" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "storageKey" VARCHAR(255) NOT NULL UNIQUE,
  "originalName" VARCHAR(200) NOT NULL,
  "contentType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "kind" "MediaAssetKind" NOT NULL,
  "uploadedById" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MediaAsset_kind_createdAt_idx" ON "MediaAsset"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "MediaAsset_uploadedById_createdAt_idx" ON "MediaAsset"("uploadedById", "createdAt");
