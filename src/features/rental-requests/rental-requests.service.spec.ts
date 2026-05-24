import { BadRequestException } from '@nestjs/common';
import { RequestStatus, VehicleAvailabilityStatus } from '@prisma/client';
import { RentalRequestsService } from './rental-requests.service';

describe('RentalRequestsService approval transactions', () => {
  let prisma: {
    vendor: { findUnique: jest.Mock };
    purchaseRequest: { findFirst: jest.Mock };
    rentalRequest: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    vehicle: { updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let notificationsService: { createNotification: jest.Mock };
  let service: RentalRequestsService;

  const rentalRequest = {
    id: 'rental-1',
    vehicleId: 'vehicle-1',
    userId: 'user-1',
    vendorId: 'vendor-1',
    status: RequestStatus.PENDING,
    startDate: new Date('2026-05-10T00:00:00.000Z'),
    endDate: new Date('2026-05-12T00:00:00.000Z'),
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
      },
      rentalRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(rentalRequest),
        update: jest.fn().mockResolvedValue({
          ...rentalRequest,
          status: RequestStatus.APPROVED,
        }),
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
    service = new RentalRequestsService(
      prisma as never,
      notificationsService as never,
    );
  });

  it('approving a rental request changes vehicle availability to RENTED', async () => {
    await expect(
      service.updateRequestStatus('vendor-account', 'rental-1', {
        status: RequestStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: RequestStatus.APPROVED });

    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'vehicle-1',
        availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
      },
      data: { availabilityStatus: VehicleAvailabilityStatus.RENTED },
    });
    expect(prisma.rentalRequest.update).toHaveBeenCalledWith({
      where: { id: 'rental-1' },
      data: { status: RequestStatus.APPROVED },
      include: { vehicle: true },
    });
  });

  it('rejects approval when the vehicle is no longer available', async () => {
    prisma.rentalRequest.findUnique.mockResolvedValue({
      ...rentalRequest,
      vehicle: {
        ...rentalRequest.vehicle,
        availabilityStatus: VehicleAvailabilityStatus.RENTED,
      },
    });

    await expect(
      service.updateRequestStatus('vendor-account', 'rental-1', {
        status: RequestStatus.APPROVED,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a second conflicting approval for the same vehicle', async () => {
    prisma.purchaseRequest.findFirst.mockResolvedValue({
      id: 'purchase-approved',
    });

    await expect(
      service.updateRequestStatus('vendor-account', 'rental-1', {
        status: RequestStatus.APPROVED,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prisma.rentalRequest.update).not.toHaveBeenCalled();
  });
});
