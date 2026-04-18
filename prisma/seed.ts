import 'dotenv/config';
import { PrismaClient, Role, VendorVerificationStatus, ListingType, VehicleListingStatus, VehicleAvailabilityStatus, FuelType, TransmissionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD = 'Test1234';
const SALT_ROUNDS = 10;

async function main() {
  console.log('Starting idempotent database seeding...');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  console.log('Seeding accounts...');

  const adminAccount = await prisma.account.upsert({
    where: { email: 'admin@carmesh.com' },
    update: {},
    create: {
      email: 'admin@carmesh.com',
      passwordHash,
      role: Role.ADMIN,
      admin: {
        create: {
          firstName: 'Super',
          lastName: 'Admin',
        },
      },
    },
    include: { admin: true },
  });

  const vendorAccount = await prisma.account.upsert({
    where: { email: 'vendor@carmesh.com' },
    update: {},
    create: {
      email: 'vendor@carmesh.com',
      passwordHash,
      role: Role.VENDOR,
      vendor: {
        create: {
          businessName: 'Premium Motors',
          contactPersonName: 'Omar Vendor',
          verificationStatus: VendorVerificationStatus.APPROVED,
        },
      },
    },
    include: { vendor: true },
  });

  const user1Account = await prisma.account.upsert({
    where: { email: 'user1@carmesh.com' },
    update: {},
    create: {
      email: 'user1@carmesh.com',
      passwordHash,
      role: Role.USER,
      user: {
        create: {
          firstName: 'Ali',
          lastName: 'UserOne',
        },
      },
    },
    include: { user: true },
  });

  const user2Account = await prisma.account.upsert({
    where: { email: 'user2@carmesh.com' },
    update: {},
    create: {
      email: 'user2@carmesh.com',
      passwordHash,
      role: Role.USER,
      user: {
        create: {
          firstName: 'Sara',
          lastName: 'UserTwo',
        },
      },
    },
    include: { user: true },
  });

  console.log('Seeding vehicles...');

  const vendorId = vendorAccount.vendor!.id;

  const v1Id = '11111111-1111-4111-a111-111111111111';
  const v2Id = '22222222-2222-4222-a222-222222222222';
  const v3Id = '33333333-3333-4333-a333-333333333333';
  const v4Id = '44444444-4444-4444-a444-444444444444';
  const v5Id = '55555555-5555-4555-a555-555555555555';

  const generateVehicle = async (id: string, title: string, brand: string, model: string, year: number, price: number, listingStatus: VehicleListingStatus) => {
    return prisma.vehicle.upsert({
      where: { id },
      update: {}, // DO NOT overwrite if already exists to prevent destruction
      create: {
        id,
        vendorId,
        title,
        brand,
        model,
        year,
        price,
        listingType: ListingType.SALE,
        listingStatus,
        fuelType: FuelType.PETROL,
        transmission: TransmissionType.AUTOMATIC,
        availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
      },
    });
  };

  // Ensure At least 3 are PUBLISHED
  const v1 = await generateVehicle(v1Id, 'BMW X5 2023', 'BMW', 'X5', 2023, 55000, VehicleListingStatus.PUBLISHED);
  const v2 = await generateVehicle(v2Id, 'Tesla Model 3 2022', 'Tesla', 'Model 3', 2022, 40000, VehicleListingStatus.PUBLISHED);
  const v3 = await generateVehicle(v3Id, 'Mercedes C-Class 2021', 'Mercedes', 'C-Class', 2021, 45000, VehicleListingStatus.PUBLISHED);
  
  // 1 DRAFT, 1 ARCHIVED
  const v4 = await generateVehicle(v4Id, 'Toyota Camry 2020', 'Toyota', 'Camry', 2020, 20000, VehicleListingStatus.DRAFT);
  const v5 = await generateVehicle(v5Id, 'Audi Q7 2019', 'Audi', 'Q7', 2019, 30000, VehicleListingStatus.ARCHIVED);

  console.log('Seeding reviews...');

  const upsertReview = async (vehicleId: string, userId: string, rating: number, comment: string) => {
    return prisma.review.upsert({
      where: { vehicleId_userId: { vehicleId, userId } },
      update: {},
      create: { vehicleId, userId, rating, comment },
    });
  };

  // Only review PUBLISHED vehicles, ensure each user logs only 1.
  await upsertReview(v1.id, user1Account.user!.id, 5, 'Perfect condition, exactly as described.');
  await upsertReview(v2.id, user2Account.user!.id, 4, 'Drives very smoothly.');

  console.log('Seeding reports...');

  const createReportIdempotent = async (reporterAccountId: string, vehicleId: string, reason: string, description: string) => {
    const existing = await prisma.report.findFirst({
      where: { reporterAccountId, vehicleId },
    });
    if (!existing) {
      await prisma.report.create({
        data: { reporterAccountId, vehicleId, reason, description, status: 'PENDING' },
      });
    }
  };

  // Different users report different vehicles
  await createReportIdempotent(user1Account.id, v3.id, 'INCORRECT_INFO', 'The year might be 2020 instead of 2021.');
  await createReportIdempotent(user2Account.id, v4.id, 'SPAM', 'This listing is repeatedly uploaded.');
  await createReportIdempotent(user1Account.id, v5.id, 'INCORRECT_INFO', 'Archived vehicle is still showing in some parts of UI.');

  console.log('Seeding completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
