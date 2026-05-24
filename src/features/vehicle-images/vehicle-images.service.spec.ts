import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { VehicleImagesService } from './vehicle-images.service';

describe('VehicleImagesService authorization', () => {
  let prisma: {
    vehicle: {
      findUnique: jest.Mock;
    };
    vehicleImage: {
      aggregate: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    vendor: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let cloudinary: {
    uploadImageBuffer: jest.Mock;
  };
  let service: VehicleImagesService;

  const vehicle = { id: 'vehicle-1', vendorId: 'vendor-1' };
  const image = {
    id: 'image-1',
    vehicleId: 'vehicle-1',
    isPrimary: false,
    vehicle: { vendorId: 'vendor-1' },
  };

  beforeEach(() => {
    prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue(vehicle),
      },
      vehicleImage: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'image-1' }),
        delete: jest.fn().mockResolvedValue(image),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 'image-1' }]),
        findUnique: jest.fn().mockResolvedValue(image),
        update: jest.fn().mockResolvedValue({ id: 'image-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vendor: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((operation) => {
        if (Array.isArray(operation)) {
          return Promise.all(operation);
        }

        return operation(prisma);
      }),
    };
    cloudinary = {
      uploadImageBuffer: jest
        .fn()
        .mockResolvedValue('https://example.test/1.jpg'),
    };

    service = new VehicleImagesService(prisma as never, cloudinary as never);
  });

  it('allows a vendor owner to upload images for their vehicle', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-1' });

    await expect(
      service.uploadVehicleImages(
        { id: 'vendor-account', role: Role.VENDOR },
        'vehicle-1',
        [{ buffer: Buffer.from('image') }] as never,
      ),
    ).resolves.toEqual([{ id: 'image-1' }]);

    expect(prisma.vendor.findUnique).toHaveBeenCalledWith({
      where: { accountId: 'vendor-account' },
    });
    expect(cloudinary.uploadImageBuffer).toHaveBeenCalled();
  });

  it('allows a vendor owner to reorder images for their vehicle', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-1' });
    prisma.vehicleImage.findMany
      .mockResolvedValueOnce([{ id: 'image-1' }])
      .mockResolvedValueOnce([{ id: 'image-1' }]);

    await expect(
      service.reorderVehicleImages(
        { id: 'vendor-account', role: Role.VENDOR },
        'vehicle-1',
        ['image-1'],
      ),
    ).resolves.toEqual([{ id: 'image-1' }]);

    expect(prisma.vehicleImage.update).toHaveBeenCalledWith({
      where: { id: 'image-1' },
      data: { sortOrder: 0 },
    });
  });

  it('allows a vendor owner to set a primary image', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-1' });

    await expect(
      service.setPrimaryImage(
        { id: 'vendor-account', role: Role.VENDOR },
        'image-1',
      ),
    ).resolves.toEqual({ id: 'image-1' });

    expect(prisma.vehicleImage.updateMany).toHaveBeenCalledWith({
      where: { vehicleId: 'vehicle-1' },
      data: { isPrimary: false },
    });
  });

  it('allows a vendor owner to delete an image', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-1' });

    await expect(
      service.deleteImage(
        { id: 'vendor-account', role: Role.VENDOR },
        'image-1',
      ),
    ).resolves.toEqual({ message: 'Image deleted successfully' });

    expect(prisma.vehicleImage.delete).toHaveBeenCalledWith({
      where: { id: 'image-1' },
    });
  });

  it('denies another vendor from mutating vehicle images', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-2' });

    await expect(
      service.setPrimaryImage(
        { id: 'vendor-account-2', role: Role.VENDOR },
        'image-1',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.vehicleImage.updateMany).not.toHaveBeenCalled();
  });

  it('denies a normal user from mutating vehicle images', async () => {
    await expect(
      service.reorderVehicleImages(
        { id: 'user-account', role: Role.USER },
        'vehicle-1',
        ['image-1'],
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicleImage.update).not.toHaveBeenCalled();
  });

  it('allows an admin to mutate any vehicle image', async () => {
    await expect(
      service.setPrimaryImage(
        { id: 'admin-account', role: Role.ADMIN },
        'image-1',
      ),
    ).resolves.toEqual({ id: 'image-1' });

    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicleImage.update).toHaveBeenCalledWith({
      where: { id: 'image-1' },
      data: { isPrimary: true },
    });
  });
});
