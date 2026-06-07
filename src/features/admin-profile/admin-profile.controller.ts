import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { AdminProfileService } from './admin-profile.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminProfileController {
  constructor(private readonly adminProfileService: AdminProfileService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: JwtUser) {
    return this.adminProfileService.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return this.adminProfileService.updateProfile(user.id, dto);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: JwtUser, @Query('range') range?: string) {
    const validRange = ['week', 'month', 'year', 'all'].includes(range ?? '')
      ? (range as 'week' | 'month' | 'year' | 'all')
      : 'month';
    return this.adminProfileService.getDashboard(user.id, validRange);
  }

  @Get('dashboard/insights')
  getDashboardInsights(
    @CurrentUser() user: JwtUser,
    @Query('range') range?: string,
  ) {
    const validRange = ['week', 'month', 'year', 'all'].includes(range ?? '')
      ? (range as 'week' | 'month' | 'year' | 'all')
      : 'month';
    return this.adminProfileService.getDashboardInsights(user.id, validRange);
  }

  @Post('dashboard/insights/chat')
  @HttpCode(HttpStatus.OK)
  chatWithAnalytics(
    @CurrentUser() user: JwtUser,
    @Body() body: { message: string; range?: string },
  ) {
    const validRange = ['week', 'month', 'year', 'all'].includes(
      body.range ?? '',
    )
      ? (body.range as 'week' | 'month' | 'year' | 'all')
      : 'month';
    return this.adminProfileService.chatWithAnalytics(
      user.id,
      body.message,
      validRange,
    );
  }
}
