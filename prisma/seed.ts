import 'dotenv/config';
import { PrismaClient, Role, VendorVerificationStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD = 'Test1234';
const SALT_ROUNDS = 10;

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.account.deleteMany();

  const userAccount = await prisma.account.create({
    data: {
      email: 'user@carmesh.com',
      passwordHash,
      role: Role.USER,
      user: {
        create: {
          firstName: 'Ahmad',
          lastName: 'Khalil',
          phoneNumber: '+962791234567',
        },
      },
    },
    include: { user: true },
  });

  const vendorAccount = await prisma.account.create({
    data: {
      email: 'vendor@carmesh.com',
      passwordHash,
      role: Role.VENDOR,
      vendor: {
        create: {
          businessName: 'AutoParts Jordan',
          contactPersonName: 'Omar Haddad',
          phoneNumber: '+962797654321',
          businessAddress: 'Amman, Jordan',
          verificationStatus: VendorVerificationStatus.APPROVED,
        },
      },
    },
    include: { vendor: true },
  });

  const adminAccount = await prisma.account.create({
    data: {
      email: 'admin@carmesh.com',
      passwordHash,
      role: Role.ADMIN,
      admin: {
        create: {
          firstName: 'Sara',
          lastName: 'Admin',
        },
      },
    },
    include: { admin: true },
  });

  console.log('Seed completed:');
  console.log(`  USER:   ${userAccount.email} (id: ${userAccount.id})`);
  console.log(`  VENDOR: ${vendorAccount.email} (id: ${vendorAccount.id})`);
  console.log(`  ADMIN:  ${adminAccount.email} (id: ${adminAccount.id})`);
  console.log(`  Password for all: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
