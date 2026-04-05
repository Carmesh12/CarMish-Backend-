import { IsEnum, IsNotEmpty } from 'class-validator';
import { VehicleAvailabilityStatus } from '@prisma/client';

export class UpdateVehicleAvailabilityDto {
  @IsEnum(VehicleAvailabilityStatus)
  @IsNotEmpty()
  availabilityStatus!: VehicleAvailabilityStatus;
}
