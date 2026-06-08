-- CreateTable
CREATE TABLE "Vehicle3DWheelEdit" (
    "id" UUID NOT NULL,
    "vehicle3DModelId" UUID NOT NULL,
    "selectedWheelId" TEXT NOT NULL,
    "selectedWheelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle3DWheelEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalVehicle3DWheelEdit" (
    "id" UUID NOT NULL,
    "personalVehicle3DModelId" UUID NOT NULL,
    "selectedWheelId" TEXT NOT NULL,
    "selectedWheelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalVehicle3DWheelEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle3DWheelEdit_vehicle3DModelId_key" ON "Vehicle3DWheelEdit"("vehicle3DModelId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalVehicle3DWheelEdit_personalVehicle3DModelId_key" ON "PersonalVehicle3DWheelEdit"("personalVehicle3DModelId");

-- AddForeignKey
ALTER TABLE "Vehicle3DWheelEdit" ADD CONSTRAINT "Vehicle3DWheelEdit_vehicle3DModelId_fkey" FOREIGN KEY ("vehicle3DModelId") REFERENCES "Vehicle3DModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalVehicle3DWheelEdit" ADD CONSTRAINT "PersonalVehicle3DWheelEdit_personalVehicle3DModelId_fkey" FOREIGN KEY ("personalVehicle3DModelId") REFERENCES "PersonalVehicle3DModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
