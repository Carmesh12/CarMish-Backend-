import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GetVehiclesSortDto } from './dto/get-vehicles-sort.dto';

@Injectable()
export class SortService {
  buildSort(query: GetVehiclesSortDto): Prisma.VehicleOrderByWithRelationInput {
    const orderBy: any = {};

    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    return orderBy;
  }
}
