import { IsIn, IsOptional } from 'class-validator';

export type VendorDashboardRange = 'week' | 'month' | 'year' | 'all';

export class GetVendorDashboardQueryDto {
  @IsOptional()
  @IsIn(['week', 'month', 'year', 'all'])
  range?: VendorDashboardRange;
}
