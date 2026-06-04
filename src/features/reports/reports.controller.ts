import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { GetReportsDto } from './dto/get-reports.dto';

type JwtUser = { id: string; email: string; role: string };

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.VENDOR)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user.id, dto);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAllForAdmin(
    @Query() query: GetReportsDto,
    @Query('status') status?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.reportsService.findAllForAdmin(query.page, query.limit, status, vehicleId);
  }

  @Get('admin/grouped')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findGroupedForAdmin(@Query('status') status?: string) {
    return this.reportsService.findGroupedForAdmin(status);
  }

  @Patch('vehicle/:vehicleId/resolve-all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resolveAll(
    @CurrentUser() admin: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.reportsService.resolveAllForVehicle(admin.id, vehicleId);
  }

  @Patch('vehicle/:vehicleId/dismiss-all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  dismissAll(
    @CurrentUser() admin: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.reportsService.dismissAllForVehicle(admin.id, vehicleId);
  }

  @Patch('vehicle/:vehicleId/hide')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  hideVehicle(
    @CurrentUser() admin: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.reportsService.hideVehicleListing(admin.id, vehicleId);
  }

  @Post('vehicle/:vehicleId/discuss')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  discussWithVendor(
    @CurrentUser() admin: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() body: { subject: string; body: string },
  ) {
    return this.reportsService.discussWithVendor(admin.id, vehicleId, body.subject, body.body);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(
    @CurrentUser() admin: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.reportsService.updateStatus(admin.id, id, dto);
  }
}
