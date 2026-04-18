import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { VehicleListingStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, vehicleId: string, dto: CreateReviewDto) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.listingStatus !== VehicleListingStatus.PUBLISHED) {
      throw new BadRequestException('You cannot review an unpublished vehicle');
    }

    const existingReview = await this.prisma.review.findUnique({
      where: {
        vehicleId_userId: {
          vehicleId,
          userId: user.id,
        },
      },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this vehicle');
    }

    return this.prisma.review.create({
      data: {
        vehicleId,
        userId: user.id,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async findAllByVehicle(vehicleId: string, page = 1, limit = 10) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              profileImageUrl: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where: { vehicleId } })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async update(accountId: string, reviewId: string, dto: UpdateReviewDto) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== user.id) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async remove(accountId: string, reviewId: string) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== user.id) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    return this.prisma.review.delete({
      where: { id: reviewId },
    });
  }
}
