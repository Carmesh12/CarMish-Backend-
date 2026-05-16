-- CreateTable
CREATE TABLE "PersonalVehicle3DJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerName" TEXT NOT NULL,
    "externalJobId" TEXT,
    "status" "Vehicle3DJobStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "PersonalVehicle3DJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalVehicle3DModel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" UUID,
    "modelUrl" TEXT NOT NULL,
    "previewImageUrl" TEXT,
    "fileFormat" TEXT,
    "title" TEXT,
    "status" "Vehicle3DModelStatus" NOT NULL DEFAULT 'AVAILABLE',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalVehicle3DModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalVehicle3DJob_userId_idx" ON "PersonalVehicle3DJob"("userId");

-- CreateIndex
CREATE INDEX "PersonalVehicle3DJob_status_idx" ON "PersonalVehicle3DJob"("status");

-- CreateIndex
CREATE INDEX "PersonalVehicle3DJob_externalJobId_idx" ON "PersonalVehicle3DJob"("externalJobId");

-- CreateIndex
CREATE INDEX "PersonalVehicle3DModel_userId_idx" ON "PersonalVehicle3DModel"("userId");

-- CreateIndex
CREATE INDEX "PersonalVehicle3DModel_jobId_idx" ON "PersonalVehicle3DModel"("jobId");

-- AddForeignKey
ALTER TABLE "PersonalVehicle3DJob" ADD CONSTRAINT "PersonalVehicle3DJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalVehicle3DModel" ADD CONSTRAINT "PersonalVehicle3DModel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalVehicle3DModel" ADD CONSTRAINT "PersonalVehicle3DModel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PersonalVehicle3DJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
