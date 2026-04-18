import { IsIn, IsOptional } from 'class-validator';
import { GetVehiclesFilterDto } from '../../filter/dto/get-vehicles-filter.dto';

export class GetVehiclesSortDto extends GetVehiclesFilterDto {
  @IsOptional()
  @IsIn(['price', 'year', 'createdAt'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
