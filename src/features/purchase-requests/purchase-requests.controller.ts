import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { UpdatePurchaseRequestStatusDto } from './dto/update-purchase-request-status.dto';
import { PurchaseRequestsService } from './purchase-requests.service';

type JwtUser = { id: string };

@Controller('purchase-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
export class PurchaseRequestsController {
  constructor(
    private readonly purchaseRequestsService: PurchaseRequestsService,
  ) {}

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePurchaseRequestDto) {
    return this.purchaseRequestsService.create(user.id, dto);
  }

  @Get('me')
  findMyRequests(@CurrentUser() user: JwtUser) {
    return this.purchaseRequestsService.findMyRequests(user.id);
  }

  @Get('vendor/me')
  @Roles(Role.VENDOR)
  findVendorRequests(@CurrentUser() user: JwtUser) {
    return this.purchaseRequestsService.findVendorRequests(user.id);
  }

  @Get(':id')
  @Roles(Role.USER, Role.VENDOR)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.purchaseRequestsService.findOne(user.id, id);
  }

  @Patch(':id/status')
  @Roles(Role.VENDOR)
  updateRequestStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseRequestStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.purchaseRequestsService.updateRequestStatus(user.id, id, dto);
  }
}
