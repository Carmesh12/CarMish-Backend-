import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { Tripo3dModule } from '../tripo3d/tripo3d.module';
import { SupabaseStorageModule } from '../../common/supabase/supabase-storage.module';
import { Vehicle3dService } from './vehicle-3d.service';
import { VendorVehicle3dController } from './vendor-vehicle-3d.controller';
import { PersonalVehicle3dController } from './personal-vehicle-3d.controller';
import { ThreeDGenerationController } from './three-d-generation.controller';

@Module({
  imports: [PrismaModule, AuthModule, Tripo3dModule, SupabaseStorageModule],
  controllers: [
    VendorVehicle3dController,
    PersonalVehicle3dController,
    ThreeDGenerationController,
  ],
  providers: [Vehicle3dService],
  exports: [Vehicle3dService],
})
export class Vehicle3dModule {}
