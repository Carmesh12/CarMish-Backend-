import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatService } from './chat.service';

type JwtUser = { id: string; email: string; role: string };

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  createSession(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateChatSessionDto,
  ) {
    return this.chatService.createSession(user.id, dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  findMySessions(@CurrentUser() user: JwtUser) {
    return this.chatService.findMySessions(user.id);
  }

  @Get('sessions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  findOneSession(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.chatService.findOneSession(user.id, id);
  }

  @Post('sessions/:id/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  sendMessage(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(user.id, id, dto);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  deleteSession(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.chatService.deleteSession(user.id, id);
  }
}
