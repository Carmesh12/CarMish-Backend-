import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FavoritesService } from './favorites.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post(':vehicleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  addToFavorites(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.favoritesService.addToFavorites(user.id, vehicleId);
  }
  @Delete(':vehicleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  removeFromFavorites(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.favoritesService.removeFromFavorites(user.id, vehicleId);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  getMyFavorites(@CurrentUser() user: JwtUser) {
    return this.favoritesService.getMyFavorites(user.id);
  }

  @Get(':vehicleId/check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  checkFavorite(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.favoritesService.checkFavorite(user.id, vehicleId);
  }

  @Post(':vehicleId/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  toggleFavorite(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.favoritesService.toggleFavorite(user.id, vehicleId);
  }
}
