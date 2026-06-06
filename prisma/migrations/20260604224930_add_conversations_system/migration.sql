-- CreateEnum
CREATE TYPE "ConversationContext" AS ENUM ('PURCHASE_REQUEST', 'RENTAL_REQUEST', 'GENERAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CONVERSATION_NEW';
ALTER TYPE "NotificationType" ADD VALUE 'CONVERSATION_MESSAGE_RECEIVED';

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "userAccountId" UUID NOT NULL,
    "vendorAccountId" UUID NOT NULL,
    "context" "ConversationContext" NOT NULL,
    "contextEntityId" UUID,
    "vehicleId" UUID,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderAccountId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_userAccountId_idx" ON "Conversation"("userAccountId");

-- CreateIndex
CREATE INDEX "Conversation_vendorAccountId_idx" ON "Conversation"("vendorAccountId");

-- CreateIndex
CREATE INDEX "Conversation_context_idx" ON "Conversation"("context");

-- CreateIndex
CREATE INDEX "Conversation_contextEntityId_idx" ON "Conversation"("contextEntityId");

-- CreateIndex
CREATE INDEX "Conversation_vehicleId_idx" ON "Conversation"("vehicleId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_idx" ON "ConversationMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationMessage_senderAccountId_idx" ON "ConversationMessage"("senderAccountId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_vendorAccountId_fkey" FOREIGN KEY ("vendorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
