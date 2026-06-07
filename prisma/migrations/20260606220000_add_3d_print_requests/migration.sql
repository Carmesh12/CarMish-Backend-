CREATE TYPE "ThreeDPrintRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "ThreeDPrintModelType" AS ENUM (
  'VEHICLE_LISTING',
  'PERSONAL'
);

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'THREE_D_PRINT_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'THREE_D_PRINT_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'THREE_D_PRINT_REQUEST_REJECTED';

ALTER TYPE "RelatedEntityType" ADD VALUE IF NOT EXISTS 'THREE_D_PRINT_REQUEST';

CREATE TABLE "ThreeDPrintRequest" (
  "id" UUID NOT NULL,
  "requesterAccountId" UUID NOT NULL,
  "reviewedByAdminAccountId" UUID,
  "vehicle3DModelId" UUID,
  "personalVehicle3DModelId" UUID,
  "modelType" "ThreeDPrintModelType" NOT NULL,
  "modelUrlSnapshot" TEXT NOT NULL,
  "title" TEXT,
  "message" TEXT,
  "adminResponse" TEXT,
  "status" "ThreeDPrintRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ThreeDPrintRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ThreeDPrintRequest"
  ADD CONSTRAINT "ThreeDPrintRequest_requesterAccountId_fkey"
  FOREIGN KEY ("requesterAccountId")
  REFERENCES "Account"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "ThreeDPrintRequest"
  ADD CONSTRAINT "ThreeDPrintRequest_reviewedByAdminAccountId_fkey"
  FOREIGN KEY ("reviewedByAdminAccountId")
  REFERENCES "Account"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "ThreeDPrintRequest"
  ADD CONSTRAINT "ThreeDPrintRequest_vehicle3DModelId_fkey"
  FOREIGN KEY ("vehicle3DModelId")
  REFERENCES "Vehicle3DModel"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "ThreeDPrintRequest"
  ADD CONSTRAINT "ThreeDPrintRequest_personalVehicle3DModelId_fkey"
  FOREIGN KEY ("personalVehicle3DModelId")
  REFERENCES "PersonalVehicle3DModel"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "ThreeDPrintRequest_requesterAccountId_idx" ON "ThreeDPrintRequest"("requesterAccountId");
CREATE INDEX "ThreeDPrintRequest_reviewedByAdminAccountId_idx" ON "ThreeDPrintRequest"("reviewedByAdminAccountId");
CREATE INDEX "ThreeDPrintRequest_vehicle3DModelId_idx" ON "ThreeDPrintRequest"("vehicle3DModelId");
CREATE INDEX "ThreeDPrintRequest_personalVehicle3DModelId_idx" ON "ThreeDPrintRequest"("personalVehicle3DModelId");
CREATE INDEX "ThreeDPrintRequest_status_idx" ON "ThreeDPrintRequest"("status");
CREATE INDEX "ThreeDPrintRequest_modelType_idx" ON "ThreeDPrintRequest"("modelType");
