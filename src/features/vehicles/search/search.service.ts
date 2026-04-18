import { Injectable } from '@nestjs/common';
import { Prisma, VehicleListingStatus } from '@prisma/client';

@Injectable()
export class SearchService {
  buildSearchWhere(search?: string, filterWhere?: Prisma.VehicleWhereInput): Prisma.VehicleWhereInput {
    const whereClause: Prisma.VehicleWhereInput = {
      listingStatus: VehicleListingStatus.PUBLISHED,
      ...filterWhere,
    };

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { locationCity: { contains: search, mode: 'insensitive' } },
      ];
    }

    return whereClause;
  }
}
