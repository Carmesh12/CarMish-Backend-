import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';

type MutationUser = { id: string; role: string };
type VehicleOwner = { vendorId: string };

@Injectable()
export class VehicleImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async getVehicleImages(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.prisma.vehicleImage.findMany({
      where: { vehicleId },
      orderBy: [
        { isPrimary: 'desc' },
        { sortOrder: 'asc' },
        { uploadedAt: 'asc' },
      ],
    });
  }

  async uploadVehicleImages(
    user: MutationUser,
    vehicleId: string,
    files: Express.Multer.File[],
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.assertCanModifyVehicle(user, vehicle);

    if (!files.length) {
      throw new BadRequestException('At least one image is required');
    }

    const existingCount = await this.prisma.vehicleImage.count({
      where: { vehicleId },
    });

    const { _max } = await this.prisma.vehicleImage.aggregate({
      where: { vehicleId },
      _max: { sortOrder: true },
    });
    const startSortOrder = (_max.sortOrder ?? -1) + 1;

    const urls = await Promise.all(
      files.map((file) => this.cloudinary.uploadImageBuffer(file.buffer)),
    );

    return this.prisma.$transaction(
      urls.map((imageUrl, index) =>
        this.prisma.vehicleImage.create({
          data: {
            vehicleId,
            imageUrl,
            sortOrder: startSortOrder + index,
            isPrimary: existingCount === 0 && index === 0,
            angleLabel: null,
          },
        }),
      ),
    );
  }

  async setPrimaryImage(user: MutationUser, imageId: string) {
    const image = await this.prisma.vehicleImage.findUnique({
      where: { id: imageId },
      include: {
        vehicle: {
          select: { vendorId: true },
        },
      },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.assertCanModifyVehicle(user, image.vehicle);

    const { vehicleId } = image;

    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleImage.updateMany({
        where: { vehicleId },
        data: { isPrimary: false },
      });

      return tx.vehicleImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      });
    });
  }

  async deleteImage(user: MutationUser, imageId: string) {
    const image = await this.prisma.vehicleImage.findUnique({
      where: { id: imageId },
      include: {
        vehicle: {
          select: { vendorId: true },
        },
      },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.assertCanModifyVehicle(user, image.vehicle);

    const { vehicleId, isPrimary } = image;

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleImage.delete({ where: { id: imageId } });

      if (isPrimary) {
        const nextPrimary = await tx.vehicleImage.findFirst({
          where: { vehicleId },
          orderBy: { uploadedAt: 'asc' },
        });

        if (nextPrimary) {
          await tx.vehicleImage.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    return { message: 'Image deleted successfully' };
  }

  async reorderVehicleImages(
    user: MutationUser,
    vehicleId: string,
    imageIds: string[],
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.assertCanModifyVehicle(user, vehicle);

    const images = await this.prisma.vehicleImage.findMany({
      where: { vehicleId },
      select: { id: true },
    });

    const dbIdSet = new Set(images.map((img) => img.id));

    if (imageIds.length !== images.length) {
      throw new BadRequestException(
        'imageIds must list every image for this vehicle exactly once',
      );
    }

    if (new Set(imageIds).size !== imageIds.length) {
      throw new BadRequestException('imageIds must not contain duplicates');
    }

    for (const id of imageIds) {
      if (!dbIdSet.has(id)) {
        throw new BadRequestException(
          'Every imageId must belong to this vehicle',
        );
      }
    }

    await this.prisma.$transaction(
      imageIds.map((id, index) =>
        this.prisma.vehicleImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.prisma.vehicleImage.findMany({
      where: { vehicleId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async assertCanModifyVehicle(
    user: MutationUser,
    vehicle: VehicleOwner,
  ) {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role !== Role.VENDOR) {
      throw new ForbiddenException(
        'You do not have permission to modify this vehicle',
      );
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { accountId: user.id },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }
  }
}
