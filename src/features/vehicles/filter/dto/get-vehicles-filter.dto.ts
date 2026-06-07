import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  BodyType,
  DrivetrainType,
  FuelType,
  ListingType,
  TransmissionType,
  VehicleAvailabilityStatus,
  VehicleCondition,
} from '@prisma/client';

export class GetVehiclesFilterDto {
  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  locationCity?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsNumber()
  yearFrom?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(String(value), 10))
  @IsNumber()
  yearTo?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseFloat(String(value)))
  @IsNumber()
  priceMin?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseFloat(String(value)))
  @IsNumber()
  priceMax?: number;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @IsEnum(FuelType)
  engineType?: FuelType;

  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType;

  @IsOptional()
  @IsEnum(VehicleCondition)
  condition?: VehicleCondition;

  @IsOptional()
  @IsEnum(DrivetrainType)
  drivetrain?: DrivetrainType;

  @IsOptional()
  @IsEnum(BodyType)
  bodyType?: BodyType;

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @IsOptional()
  @IsEnum(VehicleAvailabilityStatus)
  availabilityStatus?: VehicleAvailabilityStatus;
}
