import { IsEnum } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class UpdateReportStatusDto {
  @IsEnum(ReportStatus)
  status: ReportStatus;
}
