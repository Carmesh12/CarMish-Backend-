import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingType,
  NotificationType,
  RelatedEntityType,
  RequestStatus,
  VehicleAvailabilityStatus,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRentalRequestDto } from './dto/create-rental-request.dto';
import { UpdateRentalRequestStatusDto } from './dto/update-rental-request-status.dto';

@Injectable()
export class RentalRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(accountId: string, dto: CreateRentalRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.listingStatus !== VehicleListingStatus.PUBLISHED) {
      throw new BadRequestException('Vehicle is not available for rent');
    }

    if (
      vehicle.listingType !== ListingType.RENT &&
      vehicle.listingType !== ListingType.BOTH
    ) {
      throw new BadRequestException('Vehicle is not listed for rent');
    }

    if (vehicle.availabilityStatus !== VehicleAvailabilityStatus.AVAILABLE) {
      throw new BadRequestException('Vehicle is not currently available');
    }

    if (!vehicle.rentalPricePerDay) {
      throw new BadRequestException('Vehicle does not have a rental price');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    const overlap = await this.prisma.rentalRequest.findFirst({
      where: {
        vehicleId: dto.vehicleId,
        status: RequestStatus.APPROVED,
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
    });

    if (overlap) {
      throw new BadRequestException(
        'Vehicle is already booked for the selected period',
      );
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const numberOfDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / msPerDay,
    );
    const totalPrice = Number(vehicle.rentalPricePerDay) * numberOfDays;

    const request = await this.prisma.rentalRequest.create({
      data: {
        vehicleId: dto.vehicleId,
        userId: user.id,
        vendorId: vehicle.vendorId,
        startDate,
        endDate,
        totalPrice,
        message: dto.message ?? null,
        status: RequestStatus.PENDING,
      },
    });

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vehicle.vendorId },
    });

    if (vendor) {
      await this.notificationsService.createNotification({
        accountId: vendor.accountId,
        title: 'New Rental Request',
        body: 'A user requested to rent your vehicle',
        type: NotificationType.RENTAL_REQUEST_CREATED,
        relatedEntityType: RelatedEntityType.RENTAL_REQUEST,
        relatedEntityId: request.id,
      });
    }

    return request;
  }

  async findMyRequests(accountId: string) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.prisma.rentalRequest.findMany({
      where: { userId: user.id },
      include: {
        vehicle: true,
        vendor: { select: { accountId: true, businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findVendorRequests(accountId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { accountId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return this.prisma.rentalRequest.findMany({
      where: { vendorId: vendor.id },
      include: {
        vehicle: true,
        user: { select: { accountId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateRequestStatus(
    accountId: string,
    requestId: string,
    dto: UpdateRentalRequestStatusDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { accountId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    const allowedStatuses: RequestStatus[] = [
      RequestStatus.APPROVED,
      RequestStatus.REJECTED,
    ];

    if (!allowedStatuses.includes(dto.status)) {
      throw new BadRequestException('Invalid status value');
    }

    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      const rentalRequest = await tx.rentalRequest.findUnique({
        where: { id: requestId },
        include: { vehicle: true },
      });

      if (!rentalRequest) {
        throw new NotFoundException('Rental request not found');
      }

      if (rentalRequest.vehicle.vendorId !== vendor.id) {
        throw new ForbiddenException(
          'You are not allowed to update this request',
        );
      }

      if (dto.status === RequestStatus.APPROVED) {
        if (
          rentalRequest.vehicle.availabilityStatus !==
          VehicleAvailabilityStatus.AVAILABLE
        ) {
          throw new BadRequestException('Vehicle is not currently available');
        }

        const [approvedPurchaseRequest, approvedRentalRequest] =
          await Promise.all([
            tx.purchaseRequest.findFirst({
              where: {
                vehicleId: rentalRequest.vehicleId,
                status: RequestStatus.APPROVED,
              },
            }),
            tx.rentalRequest.findFirst({
              where: {
                id: { not: requestId },
                vehicleId: rentalRequest.vehicleId,
                status: RequestStatus.APPROVED,
              },
            }),
          ]);

        if (approvedPurchaseRequest || approvedRentalRequest) {
          throw new BadRequestException(
            'Vehicle already has an approved request',
          );
        }

        const vehicleUpdate = await tx.vehicle.updateMany({
          where: {
            id: rentalRequest.vehicleId,
            availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
          },
          data: { availabilityStatus: VehicleAvailabilityStatus.RENTED },
        });

        if (vehicleUpdate.count !== 1) {
          throw new BadRequestException('Vehicle is not currently available');
        }
      }

      return tx.rentalRequest.update({
        where: { id: requestId },
        data: { status: dto.status },
        include: { vehicle: true },
      });
    });

    const user = await this.prisma.user.findUnique({
      where: { id: updatedRequest.userId },
    });

    if (user) {
      const isApproved = dto.status === RequestStatus.APPROVED;
      await this.notificationsService.createNotification({
        accountId: user.accountId,
        title: isApproved ? 'Request Approved' : 'Request Rejected',
        body: isApproved
          ? 'Your rental request has been approved'
          : 'Your rental request has been rejected',
        type: isApproved
          ? NotificationType.RENTAL_REQUEST_APPROVED
          : NotificationType.RENTAL_REQUEST_REJECTED,
        relatedEntityType: RelatedEntityType.RENTAL_REQUEST,
        relatedEntityId: updatedRequest.id,
      });
    }

    return updatedRequest;
  }

  async findOne(accountId: string, requestId: string) {
    const rentalRequest = await this.prisma.rentalRequest.findUnique({
      where: { id: requestId },
      include: { vehicle: true },
    });

    if (!rentalRequest) {
      throw new NotFoundException('Rental request not found');
    }

    const [user, vendor] = await Promise.all([
      this.prisma.user.findUnique({ where: { accountId } }),
      this.prisma.vendor.findUnique({ where: { accountId } }),
    ]);

    const isOwner = user !== null && rentalRequest.userId === user.id;
    const isVendor = vendor !== null && rentalRequest.vendorId === vendor.id;

    if (!isOwner && !isVendor) {
      throw new ForbiddenException('You are not allowed to view this request');
    }

    return rentalRequest;
  }
}
