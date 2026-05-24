import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  RequestStatus,
  Role,
  VehicleAvailabilityStatus,
  VehicleListingStatus,
  VendorVerificationStatus,
} from '@prisma/client';
import { VendorProfileService } from './vendor-profile.service';

describe('VendorProfileService', () => {
  let prisma: {
    account: { findUnique: jest.Mock; update: jest.Mock };
    vendor: { update: jest.Mock };
    vehicle: { findMany: jest.Mock };
    purchaseRequest: { findMany: jest.Mock };
    rentalRequest: { findMany: jest.Mock };
    favorite: { count: jest.Mock };
    review: { findMany: jest.Mock };
    report: { count: jest.Mock };
  };
  let cloudinaryService: { uploadImageBuffer: jest.Mock };
  let service: VendorProfileService;
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  const vendorAccount = {
    id: 'account-1',
    email: 'vendor@example.com',
    role: Role.VENDOR,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    vendor: {
      id: 'vendor-1',
      accountId: 'account-1',
      businessName: 'Premium Motors',
      contactPersonName: 'Omar Vendor',
      phoneNumber: '123',
      businessAddress: 'Amman',
      logoUrl: null,
      verificationStatus: VendorVerificationStatus.PENDING,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue(vendorAccount),
        update: jest.fn().mockResolvedValue(undefined),
      },
      vendor: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      purchaseRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rentalRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      favorite: {
        count: jest.fn().mockResolvedValue(0),
      },
      review: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      report: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    cloudinaryService = {
      uploadImageBuffer: jest.fn().mockResolvedValue('https://cdn/logo.png'),
    };
    service = new VendorProfileService(
      prisma as never,
      cloudinaryService as never,
    );
  });

  afterAll(() => {
    if (originalGeminiApiKey) {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
  });

  it('changes vendor password when current password is valid', async () => {
    const passwordHash = await bcrypt.hash('old-password', 10);
    prisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      role: Role.VENDOR,
      passwordHash,
    });

    await expect(
      service.changePassword('account-1', {
        currentPassword: 'old-password',
        newPassword: 'new-password',
        confirmNewPassword: 'new-password',
      }),
    ).resolves.toEqual({ message: 'Password updated successfully' });

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { passwordHash: expect.any(String) },
    });
  });

  it('rejects invalid current password', async () => {
    const passwordHash = await bcrypt.hash('old-password', 10);
    prisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      role: Role.VENDOR,
      passwordHash,
    });

    await expect(
      service.changePassword('account-1', {
        currentPassword: 'wrong-password',
        newPassword: 'new-password',
        confirmNewPassword: 'new-password',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('uploads and stores vendor logo', async () => {
    const file = {
      buffer: Buffer.from('logo'),
    } as Express.Multer.File;

    await expect(service.updateLogo('account-1', file)).resolves.toEqual({
      message: 'Vendor logo uploaded successfully',
      logoUrl: 'https://cdn/logo.png',
    });
    expect(cloudinaryService.uploadImageBuffer).toHaveBeenCalledWith(
      file.buffer,
      'carmesh/vendor-logos',
    );
    expect(prisma.vendor.update).toHaveBeenCalledWith({
      where: { id: 'vendor-1' },
      data: { logoUrl: 'https://cdn/logo.png' },
    });
  });

  it('returns dashboard analytics from current vendor data', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      {
        id: 'vehicle-1',
        title: 'BMW X5',
        brand: 'BMW',
        model: 'X5',
        listingStatus: VehicleListingStatus.PUBLISHED,
        availabilityStatus: VehicleAvailabilityStatus.SOLD,
        createdAt: new Date(),
        _count: {
          purchaseRequests: 1,
          rentalRequests: 0,
          favorites: 2,
          reviews: 1,
        },
      },
    ]);
    prisma.purchaseRequest.findMany.mockResolvedValue([
      {
        vehicleId: 'vehicle-1',
        status: RequestStatus.APPROVED,
        offeredPrice: 30000,
        createdAt: new Date(),
      },
    ]);
    prisma.rentalRequest.findMany.mockResolvedValue([]);
    prisma.favorite.count.mockResolvedValue(2);
    prisma.review.findMany.mockResolvedValue([
      { vehicleId: 'vehicle-1', rating: 5, createdAt: new Date() },
    ]);

    const result = await service.getDashboard('account-1', 'month');

    expect(result.analytics.kpis.estimatedRevenue).toBe(30000);
    expect(result.analytics.inventory.published).toBe(1);
    expect(result.analytics.requests.purchase.approved).toBe(1);
    expect(result.analytics.topVehicles[0]).toMatchObject({
      id: 'vehicle-1',
      title: 'BMW X5',
    });
    expect(result.analytics.insights[0].source).toBe('fallback');
  });

  it('answers analytics chat with fallback when Gemini is not configured', async () => {
    const result = await service.chatWithAnalytics('account-1', {
      message: 'How can I improve my vehicles?',
      range: 'month',
    });

    expect(result.source).toBe('fallback');
    expect(result.answer).toContain('dashboard-based recommendation');
    expect(result.answer).toContain('- Review pending requests');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
