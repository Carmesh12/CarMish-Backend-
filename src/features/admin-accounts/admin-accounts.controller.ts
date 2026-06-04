import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAccountsService } from './admin-accounts.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('admin/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAccountsController {
  constructor(private readonly adminAccountsService: AdminAccountsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.adminAccountsService.listAccounts(
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      role,
      isActive,
      search,
    );
  }

  @Get(':id')
  getDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminAccountsService.getAccountDetails(id);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminAccountsService.deactivateAccount(user.id, id, body.reason);
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminAccountsService.activateAccount(user.id, id);
  }
}
