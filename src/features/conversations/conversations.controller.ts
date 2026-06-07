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
import { ConversationsService } from './conversations.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.VENDOR)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @Roles(Role.USER)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      vendorAccountId: string;
      context: string;
      contextEntityId?: string;
      vehicleId?: string;
      message: string;
    },
  ) {
    return this.conversationsService.create(user.id, body);
  }

  @Post('find-or-create')
  @Roles(Role.USER, Role.VENDOR)
  @HttpCode(HttpStatus.OK)
  findOrCreate(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      vendorAccountId: string;
      userAccountId?: string;
      context: 'PURCHASE_REQUEST' | 'RENTAL_REQUEST';
      contextEntityId: string;
      message?: string;
    },
  ) {
    return this.conversationsService.findOrCreate(user.id, body);
  }

  @Get('me')
  getMyConversations(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationsService.getMyConversations(
      user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':id')
  getConversation(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversationsService.getById(id, user.id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { body: string },
  ) {
    return this.conversationsService.sendMessage(id, user.id, body.body);
  }

  @Patch(':id/close')
  @HttpCode(HttpStatus.OK)
  closeConversation(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversationsService.closeConversation(id, user.id);
  }
}
