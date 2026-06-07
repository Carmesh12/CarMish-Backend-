import {
  Body,
  Controller,
  Get,
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
import { CreateThreeDPrintRequestDto } from './dto/create-three-d-print-request.dto';
import { GetThreeDPrintRequestsQueryDto } from './dto/get-three-d-print-requests-query.dto';
import { UpdateThreeDPrintRequestStatusDto } from './dto/update-three-d-print-request-status.dto';
import { ThreeDPrintRequestsService } from './three-d-print-requests.service';

type JwtUser = { id: string; email: string; role: string };

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThreeDPrintRequestsController {
  constructor(
    private readonly threeDPrintRequestsService: ThreeDPrintRequestsService,
  ) {}

  @Post('3d-print-requests')
  @Roles(Role.USER, Role.VENDOR)
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateThreeDPrintRequestDto,
  ) {
    return this.threeDPrintRequestsService.create(user, dto);
  }

  @Get('3d-print-requests/my')
  @Roles(Role.USER, Role.VENDOR)
  findMine(
    @CurrentUser() user: JwtUser,
    @Query() query: GetThreeDPrintRequestsQueryDto,
  ) {
    return this.threeDPrintRequestsService.findMine(user.id, query);
  }

  @Get('admin/3d-print-requests')
  @Roles(Role.ADMIN)
  findAllForAdmin(@Query() query: GetThreeDPrintRequestsQueryDto) {
    return this.threeDPrintRequestsService.findAllForAdmin(query);
  }

  @Patch('admin/3d-print-requests/:id/status')
  @Roles(Role.ADMIN)
  updateStatus(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateThreeDPrintRequestStatusDto,
  ) {
    return this.threeDPrintRequestsService.updateStatus(user.id, id, dto);
  }
}
