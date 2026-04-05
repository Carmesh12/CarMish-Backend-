import { IsEnum, IsNotEmpty } from 'class-validator';
import { VehicleListingStatus } from '@prisma/client';

export class UpdateVehicleListingStatusDto {
  @IsEnum(VehicleListingStatus)
  @IsNotEmpty()
  listingStatus!: VehicleListingStatus;
}
