import { Module } from '@nestjs/common';
import { VehicleImagesController } from './vehicle-images.controller';
import { VehicleImagesService } from './vehicle-images.service';

@Module({
  controllers: [VehicleImagesController],
  providers: [VehicleImagesService],
})
export class VehicleImagesModule {}
