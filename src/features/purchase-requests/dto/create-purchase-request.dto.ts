import { IsNumber, IsOptional, IsString, IsUUID, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseRequestDto {
  @IsUUID()
  @IsNotEmpty()
  vehicleId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  offeredPrice?: number;

  @IsOptional()
  @IsString()
  message?: string;
}
