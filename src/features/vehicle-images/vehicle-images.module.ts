import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
import {
  VehicleImagesController,
  VehicleImagesPrimaryController,
} from './vehicle-images.controller';
import { VehicleImagesService } from './vehicle-images.service';

@Module({
  imports: [CloudinaryModule],
  controllers: [VehicleImagesController, VehicleImagesPrimaryController],
  providers: [VehicleImagesService],
})
export class VehicleImagesModule {}
