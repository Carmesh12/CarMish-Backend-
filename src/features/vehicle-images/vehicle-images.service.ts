import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';

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
    vehicleId: string,
    files: Express.Multer.File[],
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

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

  async setPrimaryImage(imageId: string) {
    const image = await this.prisma.vehicleImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

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

  async deleteImage(imageId: string) {
    const image = await this.prisma.vehicleImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

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

  async reorderVehicleImages(vehicleId: string, imageIds: string[]) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

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
}