import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateThreeDPrintRequestDto {
  @IsOptional()
  @IsUUID()
  vehicle3DModelId?: string;

  @IsOptional()
  @IsUUID()
  personalVehicle3DModelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
