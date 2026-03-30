import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VendorProfileController } from './vendor-profile.controller';
import { VendorProfileService } from './vendor-profile.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VendorProfileController],
  providers: [VendorProfileService, RolesGuard],
})
export class VendorProfileModule {}
