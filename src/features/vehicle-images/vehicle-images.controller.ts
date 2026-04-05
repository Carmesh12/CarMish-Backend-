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
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReorderVehicleImagesDto } from './dto/reorder-vehicle-images.dto';
import { VehicleImagesService } from './vehicle-images.service';
import { vehicleImagesMulterOptions } from './vehicle-images.multer';

@Controller('vehicles')
export class VehicleImagesController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Get(':vehicleId/images')
  getVehicleImages(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.vehicleImagesService.getVehicleImages(vehicleId);
  }

  @Post(':vehicleId/images')
  @UseInterceptors(FilesInterceptor('images', 10, vehicleImagesMulterOptions))
  uploadVehicleImages(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.vehicleImagesService.uploadVehicleImages(
      vehicleId,
      files ?? [],
    );
  }

  @Patch(':vehicleId/images/reorder')
  reorderVehicleImages(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() body: ReorderVehicleImagesDto,
  ) {
    return this.vehicleImagesService.reorderVehicleImages(
      vehicleId,
      body.imageIds,
    );
  }
}

@Controller('vehicle-images')
export class VehicleImagesPrimaryController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}

  @Patch(':imageId/set-primary')
  setPrimaryImage(@Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.vehicleImagesService.setPrimaryImage(imageId);
  }

  @Delete(':imageId')
  deleteImage(@Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.vehicleImagesService.deleteImage(imageId);
  }
}
