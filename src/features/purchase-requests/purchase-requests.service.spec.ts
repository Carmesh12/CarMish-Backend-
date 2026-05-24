import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RequestStatus, VehicleAvailabilityStatus } from '@prisma/client';
import { PurchaseRequestsService } from './purchase-requests.service';

describe('PurchaseRequestsService approval transactions', () => {
  let prisma: {
    vendor: { findUnique: jest.Mock };
    purchaseRequest: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    rentalRequest: { findFirst: jest.Mock };
    vehicle: { updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let notificationsService: { createNotification: jest.Mock };
  let service: PurchaseRequestsService;

  const purchaseRequest = {
    id: 'purchase-1',
    vehicleId: 'vehicle-1',
    userId: 'user-1',
    vendorId: 'vendor-1',
    status: RequestStatus.PENDING,
    vehicle: {
      id: 'vehicle-1',
      vendorId: 'vendor-1',
      availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
    },
  };

  beforeEach(() => {
    prisma = {
      vendor: {
        findUnique: jest.fn().mockResolvedValue({ id: 'vendor-1' }),
      },
      purchaseRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(purchaseRequest),
        update: jest.fn().mockResolvedValue({
          ...purchaseRequest,
          status: RequestStatus.APPROVED,
        }),
      },
      rentalRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vehicle: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((operation) => operation(prisma)),
    };
    notificationsService = {
      createNotification: jest.fn(),
    };
    service = new PurchaseRequestsService(
      prisma as never,
      notificationsService as never,
    );
  });

  it('approving a purchase request changes vehicle availability to SOLD', async () => {
    await expect(
      service.updateRequestStatus('vendor-account', 'purchase-1', {
        status: RequestStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: RequestStatus.APPROVED });

    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'vehicle-1',
        availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
      },
      data: { availabilityStatus: VehicleAvailabilityStatus.SOLD },
    });
    expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
      where: { id: 'purchase-1' },
      data: { status: RequestStatus.APPROVED },
      include: { vehicle: true },
    });
  });

  it('denies approving a request for a vehicle the vendor does not own', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue({
      ...purchaseRequest,
      vehicle: { ...purchaseRequest.vehicle, vendorId: 'vendor-2' },
    });

    await expect(
      service.updateRequestStatus('vendor-account', 'purchase-1', {
        status: RequestStatus.APPROVED,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prisma.purchaseRequest.update).not.toHaveBeenCalled();
  });

  it('rejects approval when the vehicle is no longer available', async () => {
    prisma.purchaseRequest.findUnique.mockResolvedValue({
      ...purchaseRequest,
      vehicle: {
        ...purchaseRequest.vehicle,
        availabilityStatus: VehicleAvailabilityStatus.SOLD,
      },
    });

    await expect(
      service.updateRequestStatus('vendor-account', 'purchase-1', {
        status: RequestStatus.APPROVED,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a second conflicting approval for the same vehicle', async () => {
    prisma.rentalRequest.findFirst.mockResolvedValue({
      id: 'rental-approved',
    });

    await expect(
      service.updateRequestStatus('vendor-account', 'purchase-1', {
        status: RequestStatus.APPROVED,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prisma.purchaseRequest.update).not.toHaveBeenCalled();
  });
});
