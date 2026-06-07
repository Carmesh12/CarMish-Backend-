import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ThreeDPrintRequestStatus } from '@prisma/client';

export class UpdateThreeDPrintRequestStatusDto {
  @IsEnum(ThreeDPrintRequestStatus)
  status!: ThreeDPrintRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminResponse?: string;
}
