import 'dotenv/config';
import {
  BodyType,
  Currency,
  DrivetrainType,
  FuelType,
  InteriorMaterial,
  ListingType,
  PrismaClient,
  Role,
  TransmissionType,
  VehicleAvailabilityStatus,
  VehicleCondition,
  VehicleListingStatus,
  VendorVerificationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';

const SEED_EMAIL_BASE = 'carvision489';
const SEED_EMAIL_DOMAIN = 'gmail.com';
const SEED_PASSWORD = 'Test1234';
const SALT_ROUNDS = 10;
const VENDOR_COUNT = 10;
const USER_COUNT = 50;
const CAR_COUNT = 200;

type SeedVendor = {
  accountId: string;
  vendorId: string;
  email: string;
};

const vendorCompanies = [
  { company: 'Amman Premier Motors', contact: 'Omar Haddad', city: 'Amman' },
  { company: 'Levant Auto Gallery', contact: 'Rami Mansour', city: 'Irbid' },
  { company: 'Petra Luxury Cars', contact: 'Fadi Nasser', city: 'Amman' },
  { company: 'Jordan Valley Motors', contact: 'Yousef Khalil', city: 'Salt' },
  { company: 'Red Sea Auto House', contact: 'Khaled Saleh', city: 'Aqaba' },
  { company: 'Capital Drive Center', contact: 'Samer Qasem', city: 'Amman' },
  { company: 'North Star Vehicles', contact: 'Tariq Alami', city: 'Irbid' },
  {
    company: 'Modern Wheels Jordan',
    contact: 'Mahmoud Darwish',
    city: 'Zarqa',
  },
  { company: 'Elite Road Motors', contact: 'Nader Jaber', city: 'Amman' },
  { company: 'Royal Car Market', contact: 'Hani Mustafa', city: 'Madaba' },
];

const carCatalog: Record<string, string[]> = {
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Prado', 'Yaris'],
  BMW: ['320i', '520i', 'X3', 'X5', 'X6', 'M340i'],
  Mercedes: ['C-Class', 'E-Class', 'GLC', 'GLE', 'S-Class', 'A-Class'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  Hyundai: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Kona', 'Accent'],
  Kia: ['Cerato', 'Sportage', 'Sorento', 'K5', 'Picanto', 'Seltos'],
  Nissan: ['Altima', 'Sunny', 'Patrol', 'X-Trail', 'Kicks', 'Maxima'],
  Ford: ['Focus', 'Fusion', 'Escape', 'Explorer', 'Mustang', 'Edge'],
  Honda: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'City'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X'],
};

const jordanCities = [
  'Amman',
  'Irbid',
  'Zarqa',
  'Aqaba',
  'Salt',
  'Madaba',
  'Karak',
  'Jerash',
  'Mafraq',
  'Ajloun',
];

const trims = ['Base', 'Comfort', 'Sport', 'Luxury', 'Premium', 'Limited'];
const engineCapacities = ['1.6L', '2.0L', '2.5L', '3.0L', '3.5L', 'Electric'];
const wheelSizes = ['16 inch', '17 inch', '18 inch', '19 inch', '20 inch'];

function assertSeedEnvironment(): boolean {
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv === 'production') {
    console.warn('[seed] Refusing to run seed data in production.');
    return false;
  }

  if (nodeEnv !== 'development') {
    console.warn(
      `[seed] Refusing to run seed data because NODE_ENV="${nodeEnv ?? 'undefined'}". ` +
        'Set NODE_ENV=development to seed a local/dev database.',
    );
    return false;
  }

  return true;
}

function getSeedEmail(type: 'admin' | 'vendor' | 'user', index?: number) {
  const suffix =
    index == null ? type : `${type}${String(index).padStart(3, '0')}`;
  return `${SEED_EMAIL_BASE}+${suffix}@${SEED_EMAIL_DOMAIN}`;
}

function getSeedVehicleId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function getVehicleImageUrls(index: number) {
  return Array.from({ length: 5 }, (_, imageIndex) => {
    const lock = index * 10 + imageIndex + 1;
    return `https://loremflickr.com/900/600/car,vehicle?lock=${lock}`;
  });
}

function getPhoneNumber(index: number) {
  return `079${String(index).padStart(7, '0')}`;
}

function getUserAvatarUrl(index: number) {
  const imageId = (index % 70) + 1;
  return `https://i.pravatar.cc/300?img=${imageId}`;
}

function getVendorLogoUrl(vendorName: string) {
  const name = encodeURIComponent(vendorName);
  return `https://ui-avatars.com/api/?name=${name}&background=0D1B2A&color=FFFFFF&size=300&bold=true`;
}

function pickByIndex<T>(items: T[], index: number): T {
  return items[index % items.length];
}

async function createAdmin(prisma: PrismaClient, passwordHash: string) {
  const email = getSeedEmail('admin');

  const account = await prisma.account.upsert({
    where: { email },
    update: {
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      emailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationTokenExpiresAt: null,
      admin: {
        upsert: {
          update: {
            firstName: 'CarVision',
            lastName: 'Admin',
          },
          create: {
            firstName: 'CarVision',
            lastName: 'Admin',
          },
        },
      },
    },
    create: {
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      emailVerified: true,
      admin: {
        create: {
          firstName: 'CarVision',
          lastName: 'Admin',
        },
      },
    },
    include: { admin: true },
  });

  return account;
}

async function createVendors(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<SeedVendor[]> {
  const vendors: SeedVendor[] = [];

  for (let index = 1; index <= VENDOR_COUNT; index += 1) {
    const email = getSeedEmail('vendor', index);
    const vendor = vendorCompanies[index - 1];
    const logoUrl = getVendorLogoUrl(vendor.company);

    const account = await prisma.account.upsert({
      where: { email },
      update: {
        passwordHash,
        role: Role.VENDOR,
        isActive: true,
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        vendor: {
          upsert: {
            update: {
              businessName: vendor.company,
              contactPersonName: vendor.contact,
              phoneNumber: getPhoneNumber(index),
              businessAddress: `${vendor.city} Auto District`,
              logoUrl,
              verificationStatus: VendorVerificationStatus.APPROVED,
            },
            create: {
              businessName: vendor.company,
              contactPersonName: vendor.contact,
              phoneNumber: getPhoneNumber(index),
              businessAddress: `${vendor.city} Auto District`,
              logoUrl,
              verificationStatus: VendorVerificationStatus.APPROVED,
            },
          },
        },
      },
      create: {
        email,
        passwordHash,
        role: Role.VENDOR,
        isActive: true,
        emailVerified: true,
        vendor: {
          create: {
            businessName: vendor.company,
            contactPersonName: vendor.contact,
            phoneNumber: getPhoneNumber(index),
            businessAddress: `${vendor.city} Auto District`,
            logoUrl,
            verificationStatus: VendorVerificationStatus.APPROVED,
          },
        },
      },
      include: { vendor: true },
    });

    if (!account.vendor) {
      throw new Error(`Vendor profile was not created for ${email}`);
    }

    vendors.push({
      accountId: account.id,
      vendorId: account.vendor.id,
      email,
    });
  }

  return vendors;
}

async function createUsers(prisma: PrismaClient, passwordHash: string) {
  for (let index = 1; index <= USER_COUNT; index += 1) {
    const email = getSeedEmail('user', index);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const city = pickByIndex(jordanCities, index);
    const address = `${faker.location.streetAddress()}, ${city}`;
    const phoneNumber = getPhoneNumber(1000 + index);
    const profileImageUrl = getUserAvatarUrl(index);

    await prisma.account.upsert({
      where: { email },
      update: {
        passwordHash,
        role: Role.USER,
        isActive: true,
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        user: {
          upsert: {
            update: {
              firstName,
              lastName,
              phoneNumber,
              city,
              address,
              profileImageUrl,
            },
            create: {
              firstName,
              lastName,
              phoneNumber,
              city,
              address,
              profileImageUrl,
            },
          },
        },
      },
      create: {
        email,
        passwordHash,
        role: Role.USER,
        isActive: true,
        emailVerified: true,
        user: {
          create: {
            firstName,
            lastName,
            phoneNumber,
            city,
            address,
            profileImageUrl,
          },
        },
      },
    });
  }
}

async function createCars(prisma: PrismaClient, vendors: SeedVendor[]) {
  for (let index = 1; index <= CAR_COUNT; index += 1) {
    const vendor = vendors[(index - 1) % vendors.length];
    const brand = pickByIndex(
      Object.keys(carCatalog),
      index + faker.number.int(9),
    );
    const model = pickByIndex(carCatalog[brand], index + faker.number.int(5));
    const year = faker.number.int({ min: 2016, max: 2025 });
    const condition =
      year >= 2024 && index % 4 === 0
        ? VehicleCondition.NEW
        : VehicleCondition.USED;
    const availabilityStatus = pickByIndex(
      [
        VehicleAvailabilityStatus.AVAILABLE,
        VehicleAvailabilityStatus.AVAILABLE,
        VehicleAvailabilityStatus.AVAILABLE,
        VehicleAvailabilityStatus.SOLD,
        VehicleAvailabilityStatus.RESERVED,
        VehicleAvailabilityStatus.RENTED,
      ],
      index,
    );
    const listingType =
      availabilityStatus === VehicleAvailabilityStatus.RENTED
        ? ListingType.RENT
        : availabilityStatus === VehicleAvailabilityStatus.SOLD
          ? ListingType.SALE
          : pickByIndex(
              [ListingType.SALE, ListingType.RENT, ListingType.BOTH],
              index,
            );
    const price = faker.number.int({ min: 7000, max: 95000 });
    const rentalPricePerDay =
      listingType === ListingType.RENT || listingType === ListingType.BOTH
        ? faker.number.int({ min: 25, max: 220 })
        : null;
    const locationCity = pickByIndex(jordanCities, index + 3);
    const title = `${brand} ${model} ${year}`;
    const description = `${year} ${brand} ${model} in excellent condition with verified ownership and service history.`;
    const color = faker.vehicle.color();
    const engineType = pickByIndex(
      [FuelType.PETROL, FuelType.DIESEL, FuelType.HYBRID, FuelType.ELECTRIC],
      index,
    );
    const fuelType = engineType;
    const engineCapacity =
      engineType === FuelType.ELECTRIC
        ? 'Electric'
        : pickByIndex(engineCapacities, index);
    const horsepower =
      engineType === FuelType.ELECTRIC
        ? faker.number.int({ min: 220, max: 650 })
        : faker.number.int({ min: 95, max: 450 });
    const transmission = pickByIndex(
      [
        TransmissionType.AUTOMATIC,
        TransmissionType.MANUAL,
        TransmissionType.CVT,
      ],
      index,
    );
    const drivetrain = pickByIndex(
      [
        DrivetrainType.FWD,
        DrivetrainType.RWD,
        DrivetrainType.AWD,
        DrivetrainType.FOUR_WD,
      ],
      index,
    );
    const bodyType = pickByIndex(
      [
        BodyType.SEDAN,
        BodyType.SUV,
        BodyType.HATCHBACK,
        BodyType.COUPE,
        BodyType.TRUCK,
      ],
      index,
    );
    const seats =
      bodyType === BodyType.COUPE ? 4 : bodyType === BodyType.TRUCK ? 5 : 5;
    const doors = bodyType === BodyType.COUPE ? 2 : 4;
    const mileage = faker.number.int({ min: 5_000, max: 180_000 });
    const finalMileage = condition === VehicleCondition.NEW ? 0 : mileage;
    const imageUrls = getVehicleImageUrls(index);
    const trim = pickByIndex(trims, index);
    const cylinders =
      engineType === FuelType.ELECTRIC ? null : pickByIndex([4, 6, 8], index);
    const acceleration = faker.number.float({
      min: 3.8,
      max: 12.5,
      fractionDigits: 1,
    });
    const topSpeed = faker.number.int({ min: 160, max: 280 });
    const fuelConsumption =
      engineType === FuelType.ELECTRIC
        ? 0
        : faker.number.float({ min: 4.2, max: 13.5, fractionDigits: 1 });
    const fuelTankCapacity =
      engineType === FuelType.ELECTRIC
        ? 0
        : faker.number.int({ min: 40, max: 90 });
    const wheelsSize = pickByIndex(wheelSizes, index);
    const interiorMaterial = pickByIndex(
      [
        InteriorMaterial.FABRIC,
        InteriorMaterial.LEATHER,
        InteriorMaterial.MIXED,
      ],
      index,
    );
    const hasSunroof = index % 3 === 0;
    const hasNavigation = index % 2 === 0;
    const hasBluetooth = true;
    const hasCamera = index % 4 !== 0;
    const negotiable = index % 2 === 0;
    const vinNumber = faker.vehicle.vin();

    await prisma.vehicle.upsert({
      where: { id: getSeedVehicleId(index) },
      update: {
        vendorId: vendor.vendorId,
        title,
        description,
        brand,
        model,
        trim,
        year,
        condition,
        color,
        fuelType,
        engineType,
        engineCapacity,
        horsepower,
        transmission,
        drivetrain,
        cylinders,
        acceleration,
        topSpeed,
        fuelConsumption,
        fuelTankCapacity,
        bodyType,
        doors,
        wheelsSize,
        seats,
        interiorMaterial,
        hasSunroof,
        hasNavigation,
        hasBluetooth,
        hasCamera,
        mileage: finalMileage,
        price,
        currency: Currency.USD,
        negotiable,
        rentalPricePerDay,
        listingType,
        listingStatus: VehicleListingStatus.PUBLISHED,
        availabilityStatus,
        mainImageUrl: imageUrls[0],
        vinNumber,
        locationCity,
        locationCountry: 'Jordan',
      },
      create: {
        id: getSeedVehicleId(index),
        vendorId: vendor.vendorId,
        title,
        description,
        brand,
        model,
        trim,
        year,
        condition,
        color,
        fuelType,
        engineType,
        engineCapacity,
        horsepower,
        transmission,
        drivetrain,
        cylinders,
        acceleration,
        topSpeed,
        fuelConsumption,
        fuelTankCapacity,
        bodyType,
        doors,
        wheelsSize,
        seats,
        interiorMaterial,
        hasSunroof,
        hasNavigation,
        hasBluetooth,
        hasCamera,
        mileage: finalMileage,
        price,
        currency: Currency.USD,
        negotiable,
        rentalPricePerDay,
        listingType,
        listingStatus: VehicleListingStatus.PUBLISHED,
        availabilityStatus,
        mainImageUrl: imageUrls[0],
        vinNumber,
        locationCity,
        locationCountry: 'Jordan',
        images: {
          create: imageUrls.map((imageUrl, imageIndex) => ({
            imageUrl,
            sortOrder: imageIndex,
            isPrimary: imageIndex === 0,
          })),
        },
      },
    });

    await prisma.vehicleImage.deleteMany({
      where: { vehicleId: getSeedVehicleId(index) },
    });
    await prisma.vehicleImage.createMany({
      data: imageUrls.map((imageUrl, imageIndex) => ({
        vehicleId: getSeedVehicleId(index),
        imageUrl,
        sortOrder: imageIndex,
        isPrimary: imageIndex === 0,
      })),
    });
  }
}

async function main() {
  if (!assertSeedEnvironment()) return;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run the development seed.');
  }

  faker.seed(489);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('[seed] Starting development seed...');
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

    const admin = await createAdmin(prisma, passwordHash);
    const vendors = await createVendors(prisma, passwordHash);
    await createUsers(prisma, passwordHash);
    await createCars(prisma, vendors);

    console.log('[seed] Completed successfully.');
    console.log(`[seed] Admin: ${admin.email}`);
    console.log(`[seed] Vendors: ${VENDOR_COUNT}`);
    console.log(`[seed] Users: ${USER_COUNT}`);
    console.log(`[seed] Cars: ${CAR_COUNT}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
