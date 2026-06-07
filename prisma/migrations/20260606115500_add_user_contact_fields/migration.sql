-- Add profile fields collected from regular customers.
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "address" TEXT;
