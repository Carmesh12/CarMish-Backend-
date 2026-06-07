import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { AdminVendorsService } from './admin-vendors.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('admin/vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminVendorsController {
  constructor(private readonly adminVendorsService: AdminVendorsService) {}

  @Get('pending')
  listPending(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminVendorsService.listPendingVendors(
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  @Get('pending/count')
  getPendingCount() {
    return this.adminVendorsService.getPendingCount();
  }

  @Get()
  listAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminVendorsService.listAllVendors(
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      status,
      search,
    );
  }

  @Patch(':vendorId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: JwtUser,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
  ) {
    return this.adminVendorsService.approveVendor(user.id, vendorId);
  }

  @Patch(':vendorId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: JwtUser,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminVendorsService.rejectVendor(
      user.id,
      vendorId,
      body.reason,
    );
  }

  @Post(':vendorId/message')
  @HttpCode(HttpStatus.CREATED)
  message(
    @CurrentUser() user: JwtUser,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Body() body: { subject: string; body: string },
  ) {
    return this.adminVendorsService.messageVendor(
      user.id,
      vendorId,
      body.subject,
      body.body,
    );
  }
}
