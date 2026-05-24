-- Existing accounts predate email verification, so keep them verified.
-- Future accounts default to unverified unless application code sets otherwise.
ALTER TABLE "Account"
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailVerificationTokenHash" TEXT,
  ADD COLUMN "emailVerificationTokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "Account"
  ALTER COLUMN "emailVerified" SET DEFAULT false;

CREATE UNIQUE INDEX "Account_emailVerificationTokenHash_key"
  ON "Account"("emailVerificationTokenHash");
