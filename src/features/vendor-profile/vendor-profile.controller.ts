import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChangeVendorPasswordDto } from './dto/change-vendor-password.dto';
import { GetVendorDashboardQueryDto } from './dto/get-vendor-dashboard-query.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { VendorAnalyticsChatDto } from './dto/vendor-analytics-chat.dto';
import { VendorProfileService } from './vendor-profile.service';
import { vendorLogoMulterOptions } from './vendor-logo.multer';

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

  @Patch('profile/password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangeVendorPasswordDto,
  ) {
    return this.vendorProfileService.changePassword(user.id, dto);
  }

  @Patch('profile/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', vendorLogoMulterOptions))
  updateLogo(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Logo image file is required');
    }
    return this.vendorProfileService.updateLogo(user.id, file);
  }

  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: JwtUser,
    @Query() query: GetVendorDashboardQueryDto,
  ) {
    return this.vendorProfileService.getDashboard(user.id, query.range);
  }

  @Get('dashboard/insights')
  getDashboardInsights(
    @CurrentUser() user: JwtUser,
    @Query() query: GetVendorDashboardQueryDto,
  ) {
    return this.vendorProfileService.getDashboardInsights(user.id, query.range);
  }

  @Post('dashboard/insights/chat')
  @HttpCode(HttpStatus.OK)
  chatWithAnalytics(
    @CurrentUser() user: JwtUser,
    @Body() dto: VendorAnalyticsChatDto,
  ) {
    return this.vendorProfileService.chatWithAnalytics(user.id, dto);
  }
}
