import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  ListingType,
  Role,
  VehicleCondition,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateVehicleListingStatusDto } from './dto/update-vehicle-listing-status.dto';
import { UpdateVehicleAvailabilityDto } from './dto/update-vehicle-availability.dto';
import { SearchService } from './search/search.service';
import { FilterService } from './filter/filter.service';
import { SortService } from './sort/sort.service';
import { GetVehiclesQueryDto } from './dto/get-vehicles-query.dto';
import { Vehicle3dService } from '../vehicle-3d/vehicle-3d.service';

type MutationUser = { id: string; role: string };
type VehicleOwner = { vendorId: string };

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly filterService: FilterService,
    private readonly sortService: SortService,
    private readonly vehicle3dService: Vehicle3dService,
  ) {}

  async create(accountId: string, dto: CreateVehicleDto) {
    const vendor = await this.findVendorByAccount(accountId);

    this.validatePriceForListingType(
      dto.listingType,
      dto.price,
      dto.rentalPricePerDay,
    );
    this.validateMileageForCondition(dto.condition, dto.mileage);

    const title = this.buildVehicleTitle(dto.brand, dto.model, dto.year);
    const mainImageUrl = dto.imageUrls?.[0] ?? null;

    const vehicle = await this.prisma.vehicle.create({
      data: {
        vendorId: vendor.id,
        title,
        brand: dto.brand,
        model: dto.model,
        trim: dto.trim,
        year: dto.year,
        condition: dto.condition,
        listingType: dto.listingType,
        description: dto.description,
        color: dto.color,
        fuelType: dto.fuelType,
        engineType: dto.engineType,
        engineCapacity: dto.engineCapacity,
        horsepower: dto.horsepower,
        transmission: dto.transmission,
        drivetrain: dto.drivetrain,
        cylinders: dto.cylinders,
        acceleration: dto.acceleration,
        topSpeed: dto.topSpeed,
        fuelConsumption: dto.fuelConsumption,
        fuelTankCapacity: dto.fuelTankCapacity,
        bodyType: dto.bodyType,
        doors: dto.doors,
        wheelsSize: dto.wheelsSize,
        seats: dto.seats,
        interiorMaterial: dto.interiorMaterial,
        hasSunroof: dto.hasSunroof,
        hasNavigation: dto.hasNavigation,
        hasBluetooth: dto.hasBluetooth,
        hasCamera: dto.hasCamera,
        mileage: dto.mileage,
        price: dto.price,
        currency: dto.currency ?? Currency.USD,
        negotiable: dto.negotiable,
        rentalPricePerDay: dto.rentalPricePerDay,
        vinNumber: dto.vinNumber,
        mainImageUrl,
        locationCity: dto.locationCity,
        locationCountry: dto.locationCountry ?? 'Jordan',
        images: dto.imageUrls
          ? {
              create: dto.imageUrls.map((imageUrl, index) => ({
                imageUrl,
                sortOrder: index,
                isPrimary: index === 0,
              })),
            }
          : undefined,
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
      include: {
        vendor: {
          select: {
            accountId: true,
            businessName: true,
            contactPersonName: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.listingStatus === VehicleListingStatus.PUBLISHED) {
      const threeD = await this.vehicle3dService.getListingThreeDSummary(
        vehicle.id,
      );
      return { ...vehicle, ...threeD };
    }

    if (!user || user.role !== Role.VENDOR) {
      throw new ForbiddenException(
        'You do not have permission to view this vehicle',
      );
    }

    const vendor = await this.findVendorByAccount(user.id);

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    const threeD = await this.vehicle3dService.getListingThreeDSummary(
      vehicle.id,
    );
    return { ...vehicle, ...threeD };
  }

  async getPublishedThreeD(vehicleId: string) {
    return this.vehicle3dService.getPublishedVehicleModelUrl(vehicleId);
  }

  async findMyVehicles(accountId: string) {
    const vendor = await this.findVendorByAccount(accountId);

    return this.prisma.vehicle.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(user: MutationUser, vehicleId: string, dto: UpdateVehicleDto) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.assertCanModifyVehicle(user, vehicle);

    const finalListingType = dto.listingType ?? vehicle.listingType;
    const finalPrice = dto.price !== undefined ? dto.price : vehicle.price;
    const finalRentalPrice =
      dto.rentalPricePerDay !== undefined
        ? dto.rentalPricePerDay
        : vehicle.rentalPricePerDay;
    const finalCondition = dto.condition ?? vehicle.condition;
    const finalMileage =
      dto.mileage !== undefined ? dto.mileage : vehicle.mileage;

    this.validatePriceForListingType(
      finalListingType,
      finalPrice,
      finalRentalPrice,
    );
    this.validateMileageForCondition(finalCondition, finalMileage);

    const shouldRegenerateTitle =
      dto.brand !== undefined ||
      dto.model !== undefined ||
      dto.year !== undefined;
    const finalTitle = shouldRegenerateTitle
      ? this.buildVehicleTitle(
          dto.brand ?? vehicle.brand,
          dto.model ?? vehicle.model,
          dto.year ?? vehicle.year,
        )
      : dto.title;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.imageUrls) {
        await tx.vehicleImage.deleteMany({ where: { vehicleId } });
      }

      return tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          title: finalTitle,
          description: dto.description,
          brand: dto.brand,
          model: dto.model,
          trim: dto.trim,
          year: dto.year,
          condition: dto.condition,
          color: dto.color,
          fuelType: dto.fuelType,
          engineType: dto.engineType,
          engineCapacity: dto.engineCapacity,
          horsepower: dto.horsepower,
          transmission: dto.transmission,
          drivetrain: dto.drivetrain,
          cylinders: dto.cylinders,
          acceleration: dto.acceleration,
          topSpeed: dto.topSpeed,
          fuelConsumption: dto.fuelConsumption,
          fuelTankCapacity: dto.fuelTankCapacity,
          bodyType: dto.bodyType,
          doors: dto.doors,
          wheelsSize: dto.wheelsSize,
          seats: dto.seats,
          interiorMaterial: dto.interiorMaterial,
          hasSunroof: dto.hasSunroof,
          hasNavigation: dto.hasNavigation,
          hasBluetooth: dto.hasBluetooth,
          hasCamera: dto.hasCamera,
          mileage: dto.mileage,
          price: dto.price,
          currency: dto.currency,
          negotiable: dto.negotiable,
          rentalPricePerDay: dto.rentalPricePerDay,
          locationCity: dto.locationCity,
          locationCountry: dto.locationCountry,
          vinNumber: dto.vinNumber,
          mainImageUrl: dto.imageUrls ? dto.imageUrls[0] : undefined,
          listingType: dto.listingType,
          images: dto.imageUrls
            ? {
                create: dto.imageUrls.map((imageUrl, index) => ({
                  imageUrl,
                  sortOrder: index,
                  isPrimary: index === 0,
                })),
              }
            : undefined,
        },
      });
    });

    return updated;
  }

  async updateListingStatus(
    user: MutationUser,
    vehicleId: string,
    dto: UpdateVehicleListingStatusDto,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.assertCanModifyVehicle(user, vehicle);

    if (dto.listingStatus === VehicleListingStatus.PUBLISHED) {
      await this.validateMediaForPublishing(vehicleId, vehicle.mainImageUrl);
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { listingStatus: dto.listingStatus },
    });
  }

  async updateAvailability(
    user: MutationUser,
    vehicleId: string,
    dto: UpdateVehicleAvailabilityDto,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.assertCanModifyVehicle(user, vehicle);

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { availabilityStatus: dto.availabilityStatus },
    });
  }

  async archive(user: MutationUser, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.assertCanModifyVehicle(user, vehicle);

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

    const vendor = await this.findVendorByAccount(user.id);

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }
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

  private validateMileageForCondition(
    condition: VehicleCondition,
    mileage: unknown,
  ): void {
    if (condition === VehicleCondition.USED && mileage == null) {
      throw new BadRequestException(
        'mileage is required when condition is USED',
      );
    }
  }

  private buildVehicleTitle(
    brand: string,
    model: string,
    year: number,
  ): string {
    return `${brand.trim()} ${model.trim()} ${year}`;
  }

  private async validateMediaForPublishing(
    vehicleId: string,
    mainImageUrl: string | null,
  ): Promise<void> {
    const imageCount = await this.prisma.vehicleImage.count({
      where: { vehicleId },
    });

    if (imageCount < 3 || imageCount > 8) {
      throw new BadRequestException(
        'Published vehicles must have between 3 and 8 images',
      );
    }

    if (!mainImageUrl) {
      throw new BadRequestException(
        'Published vehicles must have a primary image',
      );
    }
  }
}
