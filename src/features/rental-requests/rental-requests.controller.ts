import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateRentalRequestDto } from './dto/create-rental-request.dto';
import { UpdateRentalRequestStatusDto } from './dto/update-rental-request-status.dto';
import { RentalRequestsService } from './rental-requests.service';

type JwtUser = { id: string };

@Controller('rental-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
export class RentalRequestsController {
  constructor(private readonly rentalRequestsService: RentalRequestsService) {}

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateRentalRequestDto) {
    return this.rentalRequestsService.create(user.id, dto);
  }

  @Get('me')
  findMyRequests(@CurrentUser() user: JwtUser) {
    return this.rentalRequestsService.findMyRequests(user.id);
  }

  @Get('vendor/me')
  @Roles(Role.VENDOR)
  findVendorRequests(@CurrentUser() user: JwtUser) {
    return this.rentalRequestsService.findVendorRequests(user.id);
  }

  @Get(':id')
  @Roles(Role.USER, Role.VENDOR)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.rentalRequestsService.findOne(user.id, id);
  }

  @Patch(':id/status')
  @Roles(Role.VENDOR)
  updateRequestStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRentalRequestStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.rentalRequestsService.updateRequestStatus(user.id, id, dto);
  }
}
