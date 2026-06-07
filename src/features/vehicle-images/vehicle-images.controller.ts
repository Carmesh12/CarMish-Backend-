import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReorderVehicleImagesDto } from './dto/reorder-vehicle-images.dto';
import { VehicleImagesService } from './vehicle-images.service';
import { vehicleImagesMulterOptions } from './vehicle-images.multer';

type JwtUser = { id: string; email: string; role: string };

@Controller('vehicles')
export class VehicleImagesController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Get(':vehicleId/images')
  getVehicleImages(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.vehicleImagesService.getVehicleImages(vehicleId);
  }

  @Post(':vehicleId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 8, vehicleImagesMulterOptions))
  uploadVehicleImages(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.vehicleImagesService.uploadVehicleImages(
      user,
      vehicleId,
      files ?? [],
    );
  }

  @Patch(':vehicleId/images/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  reorderVehicleImages(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() body: ReorderVehicleImagesDto,
  ) {
    return this.vehicleImagesService.reorderVehicleImages(
      user,
      vehicleId,
      body.imageIds,
    );
  }
}

@Controller('vehicle-images')
export class VehicleImagesPrimaryController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Patch(':imageId/set-primary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  setPrimaryImage(
    @CurrentUser() user: JwtUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.vehicleImagesService.setPrimaryImage(user, imageId);
  }

  @Delete(':imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  deleteImage(
    @CurrentUser() user: JwtUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.vehicleImagesService.deleteImage(user, imageId);
  }
}
