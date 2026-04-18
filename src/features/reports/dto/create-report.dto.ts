import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReportDto {
  @IsUUID()
  vehicleId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;
}
