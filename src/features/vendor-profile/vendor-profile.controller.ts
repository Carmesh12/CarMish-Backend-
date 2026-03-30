import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { VendorProfileService } from './vendor-profile.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('vendor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
export class VendorProfileController {
  constructor(private readonly vendorProfileService: VendorProfileService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: JwtUser) {
    return this.vendorProfileService.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateVendorProfileDto,
  ) {
    return this.vendorProfileService.updateProfile(user.id, dto);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: JwtUser) {
    return this.vendorProfileService.getDashboard(user.id);
  }
}
