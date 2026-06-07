import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BodyType,
  Currency,
  DrivetrainType,
  FuelType,
  InteriorMaterial,
  ListingType,
  TransmissionType,
  VehicleCondition,
} from '@prisma/client';

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trim?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @IsEnum(VehicleCondition)
  condition?: VehicleCondition;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @IsEnum(FuelType)
  engineType?: FuelType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  engineCapacity?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  horsepower?: number;

  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType;

  @IsOptional()
  @IsEnum(DrivetrainType)
  drivetrain?: DrivetrainType;

  @IsOptional()
  @IsInt()
  @Min(1)
  cylinders?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  acceleration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  topSpeed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fuelConsumption?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fuelTankCapacity?: number;

  @IsOptional()
  @IsEnum(BodyType)
  bodyType?: BodyType;

  @IsOptional()
  @IsInt()
  @Min(2)
  doors?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  wheelsSize?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;

  @IsOptional()
  @IsEnum(InteriorMaterial)
  interiorMaterial?: InteriorMaterial;

  @IsOptional()
  @IsBoolean()
  hasSunroof?: boolean;

  @IsOptional()
  @IsBoolean()
  hasNavigation?: boolean;

  @IsOptional()
  @IsBoolean()
  hasBluetooth?: boolean;

  @IsOptional()
  @IsBoolean()
  hasCamera?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentalPricePerDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vinNumber?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @IsUrl({}, { each: true })
  @Type(() => String)
  imageUrls?: string[];

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;
}
