import { ForbiddenException } from '@nestjs/common';
import { ListingType, Role, VehicleListingStatus } from '@prisma/client';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService authorization', () => {
  let prisma: {
    vehicle: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    vendor: {
      findUnique: jest.Mock;
    };
  };
  let service: VehiclesService;

  const vehicle = {
    id: 'vehicle-1',
    vendorId: 'vendor-1',
    listingType: ListingType.SALE,
    price: 100,
    rentalPricePerDay: null,
  };

  beforeEach(() => {
    prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(vehicle),
        update: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
      },
      vendor: {
        findUnique: jest.fn(),
      },
    };

    service = new VehiclesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('allows an admin to update any vehicle', async () => {
    await expect(
      service.update({ id: 'admin-account', role: Role.ADMIN }, 'vehicle-1', {
        title: 'Updated',
      } as never),
    ).resolves.toEqual({ id: 'vehicle-1' });

    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).toHaveBeenCalled();
  });

  it('allows a vendor to update their own vehicle', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-1' });

    await expect(
      service.update({ id: 'vendor-account', role: Role.VENDOR }, 'vehicle-1', {
        title: 'Updated',
      } as never),
    ).resolves.toEqual({ id: 'vehicle-1' });

    expect(prisma.vendor.findUnique).toHaveBeenCalledWith({
      where: { accountId: 'vendor-account' },
    });
    expect(prisma.vehicle.update).toHaveBeenCalled();
  });

  it('denies another vendor from updating the vehicle', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-2' });

    await expect(
      service.update(
        { id: 'vendor-account-2', role: Role.VENDOR },
        'vehicle-1',
        { title: 'Updated' } as never,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('denies a normal user from updating the vehicle', async () => {
    await expect(
      service.update({ id: 'user-account', role: Role.USER }, 'vehicle-1', {
        title: 'Updated',
      } as never),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('allows an admin to archive any vehicle', async () => {
    await expect(
      service.archive({ id: 'admin-account', role: Role.ADMIN }, 'vehicle-1'),
    ).resolves.toEqual({ id: 'vehicle-1' });

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'vehicle-1' },
      data: { listingStatus: VehicleListingStatus.ARCHIVED },
    });
  });
});
