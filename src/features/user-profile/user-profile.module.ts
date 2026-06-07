import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PublicUserController } from './public-user.controller';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';

@Module({
  imports: [PrismaModule, AuthModule, CloudinaryModule],
  controllers: [UserProfileController, PublicUserController],
  providers: [UserProfileService, RolesGuard],
})
export class UserProfileModule {}
