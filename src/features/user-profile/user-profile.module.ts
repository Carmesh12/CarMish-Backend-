import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UserProfileController],
  providers: [UserProfileService, RolesGuard],
})
export class UserProfileModule {}
