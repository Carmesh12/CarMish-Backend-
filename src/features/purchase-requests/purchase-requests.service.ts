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
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(accountId: string, dto: CreatePurchaseRequestDto) {
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
      throw new BadRequestException('Vehicle is not available for purchase');
    }

    if (
      vehicle.listingType !== ListingType.SALE &&
      vehicle.listingType !== ListingType.BOTH
    ) {
      throw new BadRequestException('Vehicle is not listed for sale');
    }

    if (vehicle.availabilityStatus !== VehicleAvailabilityStatus.AVAILABLE) {
      throw new BadRequestException('Vehicle is not currently available');
    }

    const request = await this.prisma.purchaseRequest.create({
      data: {
        vehicleId: dto.vehicleId,
        userId: user.id,
        vendorId: vehicle.vendorId,
        offeredPrice: dto.offeredPrice ?? null,
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
        title: 'New Purchase Request',
        body: 'Someone wants to buy your vehicle',
        type: NotificationType.PURCHASE_REQUEST_CREATED,
        relatedEntityType: RelatedEntityType.PURCHASE_REQUEST,
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

    return this.prisma.purchaseRequest.findMany({
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

    return this.prisma.purchaseRequest.findMany({
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
    dto: UpdatePurchaseRequestStatusDto,
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
      const purchaseRequest = await tx.purchaseRequest.findUnique({
        where: { id: requestId },
        include: { vehicle: true },
      });

      if (!purchaseRequest) {
        throw new NotFoundException('Purchase request not found');
      }

      if (purchaseRequest.vehicle.vendorId !== vendor.id) {
        throw new ForbiddenException(
          'You are not allowed to update this request',
        );
      }

      if (dto.status === RequestStatus.APPROVED) {
        if (
          purchaseRequest.vehicle.availabilityStatus !==
          VehicleAvailabilityStatus.AVAILABLE
        ) {
          throw new BadRequestException('Vehicle is not currently available');
        }

        const [approvedPurchaseRequest, approvedRentalRequest] =
          await Promise.all([
            tx.purchaseRequest.findFirst({
              where: {
                id: { not: requestId },
                vehicleId: purchaseRequest.vehicleId,
                status: RequestStatus.APPROVED,
              },
            }),
            tx.rentalRequest.findFirst({
              where: {
                vehicleId: purchaseRequest.vehicleId,
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
            id: purchaseRequest.vehicleId,
            availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
          },
          data: { availabilityStatus: VehicleAvailabilityStatus.SOLD },
        });

        if (vehicleUpdate.count !== 1) {
          throw new BadRequestException('Vehicle is not currently available');
        }
      }

      return tx.purchaseRequest.update({
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
        title: isApproved
          ? 'Purchase Request Approved'
          : 'Purchase Request Rejected',
        body: isApproved
          ? 'Your purchase request has been approved'
          : 'Your purchase request has been rejected',
        type: isApproved
          ? NotificationType.PURCHASE_REQUEST_APPROVED
          : NotificationType.PURCHASE_REQUEST_REJECTED,
        relatedEntityType: RelatedEntityType.PURCHASE_REQUEST,
        relatedEntityId: updatedRequest.id,
      });
    }

    return updatedRequest;
  }

  async findOne(accountId: string, requestId: string) {
    const purchaseRequest = await this.prisma.purchaseRequest.findUnique({
      where: { id: requestId },
      include: { vehicle: true },
    });

    if (!purchaseRequest) {
      throw new NotFoundException('Purchase request not found');
    }

    const [user, vendor] = await Promise.all([
      this.prisma.user.findUnique({ where: { accountId } }),
      this.prisma.vendor.findUnique({ where: { accountId } }),
    ]);

    const isOwner = user !== null && purchaseRequest.userId === user.id;
    const isVendor = vendor !== null && purchaseRequest.vendorId === vendor.id;

    if (!isOwner && !isVendor) {
      throw new ForbiddenException('You are not allowed to view this request');
    }

    return purchaseRequest;
  }
}
