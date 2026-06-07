import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { VendorProfileService } from './vendor-profile.service';

@Controller('vendors')
export class PublicVendorController {
  constructor(private readonly vendorProfileService: VendorProfileService) {}

  @Get(':accountId')
  getPublicProfile(@Param('accountId', ParseUUIDPipe) accountId: string) {
    return this.vendorProfileService.getPublicProfile(accountId);
  }
}
