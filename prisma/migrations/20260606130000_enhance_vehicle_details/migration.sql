-- Enrich vehicle listings with production-grade structured specifications.

ALTER TYPE "VehicleAvailabilityStatus" ADD VALUE IF NOT EXISTS 'RESERVED';

CREATE TYPE "VehicleCondition" AS ENUM ('NEW', 'USED');
CREATE TYPE "DrivetrainType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD');
CREATE TYPE "BodyType" AS ENUM (
  'SUV',
  'SEDAN',
  'HATCHBACK',
  'COUPE',
  'TRUCK',
  'VAN',
  'WAGON',
  'CONVERTIBLE'
);
CREATE TYPE "InteriorMaterial" AS ENUM ('LEATHER', 'FABRIC', 'MIXED');
CREATE TYPE "Currency" AS ENUM ('USD', 'JOD');

ALTER TABLE "Vehicle"
  ADD COLUMN "trim" TEXT,
  ADD COLUMN "condition" "VehicleCondition" NOT NULL DEFAULT 'USED',
  ADD COLUMN "engineType" "FuelType" NOT NULL DEFAULT 'PETROL',
  ADD COLUMN "engineCapacity" TEXT NOT NULL DEFAULT '2.0L',
  ADD COLUMN "horsepower" INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN "drivetrain" "DrivetrainType" NOT NULL DEFAULT 'FWD',
  ADD COLUMN "cylinders" INTEGER,
  ADD COLUMN "acceleration" DECIMAL(4, 1),
  ADD COLUMN "topSpeed" INTEGER,
  ADD COLUMN "fuelConsumption" DECIMAL(4, 1),
  ADD COLUMN "fuelTankCapacity" INTEGER,
  ADD COLUMN "bodyType" "BodyType" NOT NULL DEFAULT 'SEDAN',
  ADD COLUMN "doors" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "wheelsSize" TEXT,
  ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "interiorMaterial" "InteriorMaterial" NOT NULL DEFAULT 'FABRIC',
  ADD COLUMN "hasSunroof" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hasNavigation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hasBluetooth" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "hasCamera" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'USD',
  ADD COLUMN "negotiable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mainImageUrl" TEXT,
  ADD COLUMN "vinNumber" TEXT,
  ADD COLUMN "locationCountry" TEXT NOT NULL DEFAULT 'Jordan';

CREATE INDEX "Vehicle_condition_idx" ON "Vehicle"("condition");
CREATE INDEX "Vehicle_engineType_idx" ON "Vehicle"("engineType");
CREATE INDEX "Vehicle_bodyType_idx" ON "Vehicle"("bodyType");
CREATE INDEX "Vehicle_drivetrain_idx" ON "Vehicle"("drivetrain");
