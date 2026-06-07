import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsUrl,
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

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trim?: string;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  year!: number;

  @IsEnum(VehicleCondition)
  condition!: VehicleCondition;

  @IsEnum(ListingType)
  listingType!: ListingType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  color!: string;

  @IsEnum(FuelType)
  fuelType!: FuelType;

  @IsEnum(FuelType)
  engineType!: FuelType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  engineCapacity!: string;

  @IsInt()
  @Min(1)
  horsepower!: number;

  @IsEnum(TransmissionType)
  transmission!: TransmissionType;

  @IsEnum(DrivetrainType)
  drivetrain!: DrivetrainType;

  @IsOptional()
  @IsInt()
  @Min(1)
  cylinders?: number;

  @IsNumber()
  @Min(1)
  acceleration!: number;

  @IsInt()
  @Min(1)
  topSpeed!: number;

  @IsNumber()
  @Min(0)
  fuelConsumption!: number;

  @IsInt()
  @Min(0)
  fuelTankCapacity!: number;

  @IsEnum(BodyType)
  bodyType!: BodyType;

  @IsInt()
  @Min(2)
  doors!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  wheelsSize?: string;

  @IsInt()
  @Min(1)
  seats!: number;

  @IsEnum(InteriorMaterial)
  interiorMaterial!: InteriorMaterial;

  @IsBoolean()
  hasSunroof!: boolean;

  @IsBoolean()
  hasNavigation!: boolean;

  @IsBoolean()
  hasBluetooth!: boolean;

  @IsBoolean()
  hasCamera!: boolean;

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

  @IsBoolean()
  negotiable!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentalPricePerDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vinNumber?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  locationCity!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  locationCountry!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @IsUrl({}, { each: true })
  @Type(() => String)
  imageUrls?: string[];
}
