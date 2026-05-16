import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { SearchService } from './search/search.service';
import { FilterService } from './filter/filter.service';
import { SortService } from './sort/sort.service';
import { Vehicle3dModule } from '../vehicle-3d/vehicle-3d.module';

@Module({
  imports: [PrismaModule, AuthModule, Vehicle3dModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, RolesGuard, SearchService, FilterService, SortService],
})
export class VehiclesModule {}
