import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FavoritesController],
  providers: [FavoritesService, RolesGuard],
})
export class FavoritesModule {}
