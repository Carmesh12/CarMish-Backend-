import { ForbiddenException } from '@nestjs/common';
import { Role, Vehicle3DJobStatus } from '@prisma/client';
import { Vehicle3dService } from './vehicle-3d.service';

describe('Vehicle3dService smoke checks', () => {
  let prisma: {
    vendor: { findUnique: jest.Mock };
    vehicle: { findUnique: jest.Mock };
    vehicle3DJob: { findFirst: jest.Mock };
    vehicle3DModel: { findFirst: jest.Mock };
  };
  let tripoHttp: { isConfigured: jest.Mock };
  let storage: {
    getNotReadyReason: jest.Mock;
    isReady: jest.Mock;
    resolveReadableModelUrl: jest.Mock;
  };
  let service: Vehicle3dService;
  const originalThreeDMockMode = process.env.THREE_D_MOCK_MODE;

  beforeEach(() => {
    delete process.env.THREE_D_MOCK_MODE;
    prisma = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({ id: 'vendor-1' }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'vehicle-1',
          vendorId: 'vendor-1',
        }),
      },
      vehicle3DJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job-1',
          vehicleId: 'vehicle-1',
          status: Vehicle3DJobStatus.PENDING,
          errorMessage: null,
        }),
      },
      vehicle3DModel: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    tripoHttp = {
      isConfigured: jest.fn().mockReturnValue(true),
    };
    storage = {
      getNotReadyReason: jest.fn().mockReturnValue('storage missing'),
      isReady: jest.fn().mockReturnValue(true),
      resolveReadableModelUrl: jest.fn(),
    };

    service = new Vehicle3dService(
      prisma as never,
      tripoHttp as never,
      {} as never,
      storage as never,
    );
  });

  afterEach(() => {
    process.env.THREE_D_MOCK_MODE = originalThreeDMockMode;
  });

  it('reports real mode config from backend readiness', () => {
    expect(service.getGenerationConfig()).toEqual({
      mockMode: false,
      mode: 'real',
      requiresModelUpload: false,
      requiresFourImages: true,
      configured: true,
      message: null,
    });
  });

  it('reports demo mode and storage dependency when mock mode is enabled', () => {
    process.env.THREE_D_MOCK_MODE = 'true';
    storage.isReady.mockReturnValue(false);

    expect(service.getGenerationConfig()).toEqual({
      mockMode: true,
      mode: 'demo',
      requiresModelUpload: true,
      requiresFourImages: false,
      configured: false,
      message: 'storage missing',
    });
  });

  it('allows admin to read any vendor listing job status', async () => {
    await expect(
      service.getVendorListingJob(
        { id: 'admin-account', role: Role.ADMIN },
        'vehicle-1',
        'job-1',
      ),
    ).resolves.toMatchObject({
      id: 'job-1',
      status: Vehicle3DJobStatus.PENDING,
      modelUrl: null,
    });

    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicle3DJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', vehicleId: 'vehicle-1' },
    });
  });

  it('allows vendor owner to read their vehicle 3D job status', async () => {
    await expect(
      service.getVendorListingJob(
        { id: 'vendor-account', role: Role.VENDOR },
        'vehicle-1',
        'job-1',
      ),
    ).resolves.toMatchObject({ id: 'job-1' });

    expect(prisma.vendor.findUnique).toHaveBeenCalledWith({
      where: { accountId: 'vendor-account' },
    });
  });

  it('denies another vendor from reading the vehicle 3D job status', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-2' });

    await expect(
      service.getVendorListingJob(
        { id: 'vendor-account-2', role: Role.VENDOR },
        'vehicle-1',
        'job-1',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.vehicle3DJob.findFirst).not.toHaveBeenCalled();
  });
});
