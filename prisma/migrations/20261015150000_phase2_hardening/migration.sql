-- Phase 2 hardening: stateful checkout, TOTP replay controls, and public media derivatives.
ALTER TYPE "EmailActionType" ADD VALUE IF NOT EXISTS 'ADMIN_MFA_ENROLL';

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "checkoutStartedAt" TIMESTAMP(3);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "pendingTwoFactorSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "totpFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totpLockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastTotpTimeStep" BIGINT;

ALTER TABLE "MediaAsset"
  ADD COLUMN IF NOT EXISTS "publicStorageKey" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "publicUrl" VARCHAR(1000);
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_publicStorageKey_key"
  ON "MediaAsset"("publicStorageKey");

ALTER TABLE "ProductImage"
  ADD COLUMN IF NOT EXISTS "assetId" UUID;
ALTER TABLE "Product3DModel"
  ADD COLUMN IF NOT EXISTS "assetId" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "ProductImage_assetId_key" ON "ProductImage"("assetId");
CREATE UNIQUE INDEX IF NOT EXISTS "Product3DModel_assetId_key" ON "Product3DModel"("assetId");
DO $$ BEGIN
  ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Product3DModel" ADD CONSTRAINT "Product3DModel_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
