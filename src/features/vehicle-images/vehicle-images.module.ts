import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
import { AuthModule } from '../auth/auth.module';
import {
  VehicleImagesController,
  VehicleImagesPrimaryController,
} from './vehicle-images.controller';
import { VehicleImagesService } from './vehicle-images.service';

@Module({
  imports: [AuthModule, CloudinaryModule],
  controllers: [VehicleImagesController, VehicleImagesPrimaryController],
  providers: [VehicleImagesService],
})
export class VehicleImagesModule {}
