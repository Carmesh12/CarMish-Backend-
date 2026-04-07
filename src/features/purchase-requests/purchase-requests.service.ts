import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingType,
  RequestStatus,
  VehicleAvailabilityStatus,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';

@Injectable()
export class PurchaseRequestsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.purchaseRequest.create({
      data: {
        vehicleId: dto.vehicleId,
        userId: user.id,
        vendorId: vehicle.vendorId,
        offeredPrice: dto.offeredPrice ?? null,
        message: dto.message ?? null,
        status: RequestStatus.PENDING,
      },
    });
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

    const purchaseRequest = await this.prisma.purchaseRequest.findUnique({
      where: { id: requestId },
    });

    if (!purchaseRequest) {
      throw new NotFoundException('Purchase request not found');
    }

    if (purchaseRequest.vendorId !== vendor.id) {
      throw new ForbiddenException(
        'You are not allowed to update this request',
      );
    }

    const allowedStatuses: RequestStatus[] = [
      RequestStatus.APPROVED,
      RequestStatus.REJECTED,
    ];
    if (!allowedStatuses.includes(dto.status)) {
      throw new BadRequestException('Invalid status value');
    }

    return this.prisma.purchaseRequest.update({
      where: { id: requestId },
      data: { status: dto.status },
    });
  }

  async findOne(accountId: string, requestId: string) {
    const purchaseRequest = await this.prisma.purchaseRequest.findUnique({
      where: { id: requestId },
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
