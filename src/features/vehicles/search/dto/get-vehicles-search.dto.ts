import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetVehiclesSearchDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;
}
