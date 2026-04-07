import { RequestStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdatePurchaseRequestStatusDto {
  @IsNotEmpty()
  @IsEnum(RequestStatus)
  status: RequestStatus;
}
