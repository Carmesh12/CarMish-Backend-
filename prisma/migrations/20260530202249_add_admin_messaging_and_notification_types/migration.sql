-- CreateEnum
CREATE TYPE "ThreadContext" AS ENUM ('VENDOR_VERIFICATION', 'REPORT_DISCUSSION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'VENDOR_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'VENDOR_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'VENDOR_MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_DEACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_ACTIVATED';

-- CreateTable
CREATE TABLE "AdminVendorThread" (
    "id" UUID NOT NULL,
    "adminAccountId" UUID NOT NULL,
    "vendorAccountId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "context" "ThreadContext" NOT NULL,
    "contextEntityId" UUID,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminVendorThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminVendorMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "senderAccountId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminVendorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminVendorThread_adminAccountId_idx" ON "AdminVendorThread"("adminAccountId");

-- CreateIndex
CREATE INDEX "AdminVendorThread_vendorAccountId_idx" ON "AdminVendorThread"("vendorAccountId");

-- CreateIndex
CREATE INDEX "AdminVendorThread_context_idx" ON "AdminVendorThread"("context");

-- CreateIndex
CREATE INDEX "AdminVendorThread_isClosed_idx" ON "AdminVendorThread"("isClosed");

-- CreateIndex
CREATE INDEX "AdminVendorMessage_threadId_idx" ON "AdminVendorMessage"("threadId");

-- CreateIndex
CREATE INDEX "AdminVendorMessage_senderAccountId_idx" ON "AdminVendorMessage"("senderAccountId");

-- AddForeignKey
ALTER TABLE "AdminVendorThread" ADD CONSTRAINT "AdminVendorThread_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminVendorThread" ADD CONSTRAINT "AdminVendorThread_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminVendorMessage" ADD CONSTRAINT "AdminVendorMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AdminVendorThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminVendorMessage" ADD CONSTRAINT "AdminVendorMessage_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
