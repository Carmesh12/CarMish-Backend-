import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { VendorDashboardRange } from './get-vendor-dashboard-query.dto';

export class VendorAnalyticsChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsIn(['week', 'month', 'year', 'all'])
  range?: VendorDashboardRange;
}
