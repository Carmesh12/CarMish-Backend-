import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingType, Role, VehicleListingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateVehicleListingStatusDto } from './dto/update-vehicle-listing-status.dto';
import { UpdateVehicleAvailabilityDto } from './dto/update-vehicle-availability.dto';
import { SearchService } from './search/search.service';
import { FilterService } from './filter/filter.service';
import { SortService } from './sort/sort.service';
import { GetVehiclesQueryDto } from './dto/get-vehicles-query.dto';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly filterService: FilterService,
    private readonly sortService: SortService,
  ) {}

  async create(accountId: string, dto: CreateVehicleDto) {
    const vendor = await this.findVendorByAccount(accountId);

    this.validatePriceForListingType(dto.listingType, dto.price, dto.rentalPricePerDay);

    const vehicle = await this.prisma.vehicle.create({
      data: {
        vendorId: vendor.id,
        title: dto.title,
        brand: dto.brand,
        model: dto.model,
        year: dto.year,
        listingType: dto.listingType,
        description: dto.description,
        color: dto.color,
        fuelType: dto.fuelType,
        transmission: dto.transmission,
        mileage: dto.mileage,
        price: dto.price,
        rentalPricePerDay: dto.rentalPricePerDay,
        locationCity: dto.locationCity,
      },
    });

    return vehicle;
  }

  async findPublicVehicles(query: GetVehiclesQueryDto) {
    const { search, page = 1, limit = 10, ...restParams } = query;
    const skip = (page - 1) * limit;
    const take = limit;

    const filterWhere = this.filterService.buildFilterWhere(restParams);
    const orderBy = this.sortService.buildSort(restParams);
    const where = this.searchService.buildSearchWhere(search, filterWhere);

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          images: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
          },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(vehicleId: string, user?: { id: string; role: string }) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.listingStatus === VehicleListingStatus.PUBLISHED) {
      return vehicle;
    }

    if (!user || user.role !== Role.VENDOR) {
      throw new ForbiddenException('You do not have permission to view this vehicle');
    }

    const vendor = await this.findVendorByAccount(user.id);

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    return vehicle;
  }

  async findMyVehicles(accountId: string) {
    const vendor = await this.findVendorByAccount(accountId);

    return this.prisma.vehicle.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(accountId: string, vehicleId: string, dto: UpdateVehicleDto) {
    const vendor = await this.findVendorByAccount(accountId);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    const finalListingType = dto.listingType ?? vehicle.listingType;
    const finalPrice = dto.price !== undefined ? dto.price : vehicle.price;
    const finalRentalPrice = dto.rentalPricePerDay !== undefined ? dto.rentalPricePerDay : vehicle.rentalPricePerDay;

    this.validatePriceForListingType(finalListingType, finalPrice, finalRentalPrice);

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        title: dto.title,
        description: dto.description,
        brand: dto.brand,
        model: dto.model,
        year: dto.year,
        color: dto.color,
        fuelType: dto.fuelType,
        transmission: dto.transmission,
        mileage: dto.mileage,
        price: dto.price,
        rentalPricePerDay: dto.rentalPricePerDay,
        locationCity: dto.locationCity,
        listingType: dto.listingType,
      },
    });

    return updated;
  }

  async updateListingStatus(
    accountId: string,
    vehicleId: string,
    dto: UpdateVehicleListingStatusDto,
  ) {
    const vendor = await this.findVendorByAccount(accountId);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { listingStatus: dto.listingStatus },
    });
  }

  async updateAvailability(
    accountId: string,
    vehicleId: string,
    dto: UpdateVehicleAvailabilityDto,
  ) {
    const vendor = await this.findVendorByAccount(accountId);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { availabilityStatus: dto.availabilityStatus },
    });
  }

  async archive(accountId: string, vehicleId: string) {
    const vendor = await this.findVendorByAccount(accountId);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { listingStatus: VehicleListingStatus.ARCHIVED },
    });
  }

  private async findVendorByAccount(accountId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { accountId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return vendor;
  }

  private validatePriceForListingType(
    listingType: ListingType,
    price: unknown,
    rentalPricePerDay: unknown,
  ): void {
    switch (listingType) {
      case ListingType.SALE:
        if (price == null) {
          throw new BadRequestException(
            'price is required when listingType is SALE',
          );
        }
        break;
      case ListingType.RENT:
        if (rentalPricePerDay == null) {
          throw new BadRequestException(
            'rentalPricePerDay is required when listingType is RENT',
          );
        }
        break;
      case ListingType.BOTH:
        if (price == null || rentalPricePerDay == null) {
          throw new BadRequestException(
            'Both price and rentalPricePerDay are required when listingType is BOTH',
          );
        }
        break;
    }
  }
}
