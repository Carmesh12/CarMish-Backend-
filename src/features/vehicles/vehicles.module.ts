import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { SearchService } from './search/search.service';
import { FilterService } from './filter/filter.service';
import { SortService } from './sort/sort.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, RolesGuard, SearchService, FilterService, SortService],
})
export class VehiclesModule {}
