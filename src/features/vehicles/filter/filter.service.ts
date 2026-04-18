import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GetVehiclesFilterDto } from './dto/get-vehicles-filter.dto';

@Injectable()
export class FilterService {
  buildFilterWhere(query: GetVehiclesFilterDto): Prisma.VehicleWhereInput {
    const andConditions: Prisma.VehicleWhereInput[] = [];

    if (query.brand) {
      andConditions.push({ brand: query.brand });
    }

    if (query.model) {
      andConditions.push({ model: query.model });
    }

    if (query.locationCity) {
      andConditions.push({ locationCity: query.locationCity });
    }

    if (query.yearFrom !== undefined || query.yearTo !== undefined) {
      const yearFilter: any = {};
      if (query.yearFrom !== undefined && !isNaN(query.yearFrom)) yearFilter.gte = query.yearFrom;
      if (query.yearTo !== undefined && !isNaN(query.yearTo)) yearFilter.lte = query.yearTo;
      if (Object.keys(yearFilter).length > 0) {
        andConditions.push({ year: yearFilter });
      }
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      const priceFilter: any = {};
      if (query.priceMin !== undefined && !isNaN(query.priceMin)) priceFilter.gte = query.priceMin;
      if (query.priceMax !== undefined && !isNaN(query.priceMax)) priceFilter.lte = query.priceMax;
      if (Object.keys(priceFilter).length > 0) {
        andConditions.push({ price: priceFilter });
      }
    }

    if (query.fuelType) {
      andConditions.push({ fuelType: query.fuelType });
    }

    if (query.transmission) {
      andConditions.push({ transmission: query.transmission });
    }

    if (query.listingType) {
      andConditions.push({ listingType: query.listingType });
    }

    if (query.availabilityStatus) {
      andConditions.push({ availabilityStatus: query.availabilityStatus });
    }

    if (andConditions.length > 0) {
      return { AND: andConditions };
    }

    return {};
  }
}
