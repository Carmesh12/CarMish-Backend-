import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateVendorProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @ValidateIf(
    (o) =>
      o.logoUrl !== undefined &&
      o.logoUrl !== null &&
      String(o.logoUrl).trim() !== '',
  )
  @IsUrl({ require_protocol: true })
  logoUrl?: string;
}
