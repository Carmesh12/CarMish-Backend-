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
import { AdminMessagingService } from './admin-messaging.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('admin/messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminMessagingController {
  constructor(private readonly messagingService: AdminMessagingService) {}

  @Get('threads')
  @Roles(Role.ADMIN, Role.VENDOR)
  getMyThreads(
    @CurrentUser() user: JwtUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagingService.getMyThreads(
      user.id,
      user.role as Role,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get('threads/:id')
  @Roles(Role.ADMIN, Role.VENDOR)
  getThread(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagingService.getThreadById(id, user.id);
  }

  @Post('threads/:id/reply')
  @Roles(Role.ADMIN, Role.VENDOR)
  @HttpCode(HttpStatus.CREATED)
  replyToThread(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { body: string },
  ) {
    return this.messagingService.replyToThread({
      threadId: id,
      senderAccountId: user.id,
      body: body.body,
    });
  }

  @Patch('threads/:id/close')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  closeThread(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagingService.closeThread(id, user.id);
  }
}
