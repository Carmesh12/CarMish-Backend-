import { Controller } from '@nestjs/common';
import { VehicleImagesService } from './vehicle-images.service';

@Controller('vehicle-images')
export class VehicleImagesController {
  constructor(private readonly vehicleImagesService: VehicleImagesService) {}
}
