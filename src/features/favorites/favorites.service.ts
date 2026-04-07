import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VehicleListingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async addToFavorites(accountId: string, vehicleId: string) {
    const user = await this.findUserByAccount(accountId);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.listingStatus !== VehicleListingStatus.PUBLISHED) {
      throw new ForbiddenException('Cannot favorite a vehicle that is not published');
    }

    const existingFavorite = await this.prisma.favorite.findUnique({
      where: {
        userId_vehicleId: {
          userId: user.id,
          vehicleId: vehicle.id,
        },
      },
    });

    if (existingFavorite) {
      throw new BadRequestException('Already in favorites');
    }

    const favorite = await this.prisma.favorite.create({
      data: {
        userId: user.id,
        vehicleId: vehicle.id,
      },
    });

    return favorite;
  }

  async removeFromFavorites(accountId: string, vehicleId: string) {
    const user = await this.findUserByAccount(accountId);

    const existingFavorite = await this.prisma.favorite.findUnique({
      where: {
        userId_vehicleId: {
          userId: user.id,
          vehicleId,
        },
      },
    });

    if (!existingFavorite) {
      throw new NotFoundException('Favorite not found');
    }

    const deleted = await this.prisma.favorite.delete({
      where: {
        id: existingFavorite.id,
      },
    });

    return deleted;
  }

  async getMyFavorites(accountId: string) {
    const user = await this.findUserByAccount(accountId);

    return this.prisma.favorite.findMany({
      where: {
        userId: user.id,
      },
      include: {
        vehicle: {
          include: {
            images: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async checkFavorite(accountId: string, vehicleId: string) {
    const user = await this.findUserByAccount(accountId);

    const existingFavorite = await this.prisma.favorite.findUnique({
      where: {
        userId_vehicleId: {
          userId: user.id,
          vehicleId,
        },
      },
    });

    return { isFavorited: !!existingFavorite };
  }

  async toggleFavorite(accountId: string, vehicleId: string) {
    const user = await this.findUserByAccount(accountId);

    const existingFavorite = await this.prisma.favorite.findUnique({
      where: {
        userId_vehicleId: {
          userId: user.id,
          vehicleId,
        },
      },
    });

    if (existingFavorite) {
      await this.prisma.favorite.delete({
        where: { id: existingFavorite.id },
      });
      return { isFavorited: false };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.listingStatus !== VehicleListingStatus.PUBLISHED) {
      throw new ForbiddenException('Cannot favorite a vehicle that is not published');
    }

    await this.prisma.favorite.create({
      data: {
        userId: user.id,
        vehicleId,
      },
    });

    return { isFavorited: true };
  }

  private async findUserByAccount(accountId: string) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }
}
