import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationContext,
  NotificationType,
  RelatedEntityType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(senderAccountId: string, dto: {
    vendorAccountId: string;
    context: string;
    contextEntityId?: string;
    vehicleId?: string;
    message: string;
  }) {
    const sender = await this.prisma.account.findUnique({
      where: { id: senderAccountId },
      select: { role: true },
    });
    if (!sender) throw new NotFoundException('Account not found');

    const vendorAccount = await this.prisma.account.findUnique({
      where: { id: dto.vendorAccountId },
      select: { id: true, email: true, role: true, vendor: { select: { id: true } } },
    });
    if (!vendorAccount || vendorAccount.role !== Role.VENDOR) {
      throw new BadRequestException('Invalid vendor account');
    }

    const context = dto.context as ConversationContext;
    if (!Object.values(ConversationContext).includes(context)) {
      throw new BadRequestException('Invalid context');
    }

    if (context !== ConversationContext.GENERAL && dto.contextEntityId) {
      const existing = await this.prisma.conversation.findFirst({
        where: {
          context,
          contextEntityId: dto.contextEntityId,
        },
      });
      if (existing) {
        throw new BadRequestException('A conversation for this request already exists');
      }
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        userAccountId: senderAccountId,
        vendorAccountId: dto.vendorAccountId,
        context,
        contextEntityId: dto.contextEntityId ?? null,
        vehicleId: dto.vehicleId ?? null,
        messages: {
          create: {
            senderAccountId,
            body: dto.message,
          },
        },
      },
      include: {
        messages: true,
        vehicle: { select: { id: true, title: true, brand: true, model: true } },
      },
    });

    await this.notificationsService.createNotification({
      accountId: dto.vendorAccountId,
      title: 'New message from a customer',
      body: dto.message.slice(0, 120),
      type: NotificationType.CONVERSATION_NEW,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: conversation.id,
    });

    await this.mailService.sendMail({
      to: vendorAccount.email,
      subject: '[CarMesh] New customer message',
      html: `
        <h3>New message from a customer</h3>
        <p>${dto.message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p>Log in to your CarMesh account to reply.</p>
      `,
    }).catch(() => {});

    return conversation;
  }

  async findOrCreate(senderAccountId: string, dto: {
    vendorAccountId: string;
    userAccountId?: string;
    context: 'PURCHASE_REQUEST' | 'RENTAL_REQUEST';
    contextEntityId: string;
    message?: string;
  }) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        context: dto.context as ConversationContext,
        contextEntityId: dto.contextEntityId,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { senderAccount: { select: { email: true, role: true } } } },
        userAccount: { select: { email: true, user: { select: { firstName: true, lastName: true } } } },
        vendorAccount: { select: { email: true, vendor: { select: { businessName: true } } } },
        vehicle: { select: { id: true, title: true, brand: true, model: true } },
      },
    });

    if (existing) return existing;

    const sender = await this.prisma.account.findUnique({
      where: { id: senderAccountId },
      select: { role: true },
    });

    if (sender?.role === Role.VENDOR) {
      if (!dto.userAccountId) {
        throw new BadRequestException('userAccountId is required for vendor-initiated conversations');
      }
      return this.createFromVendor(senderAccountId, dto.userAccountId, {
        context: dto.context,
        contextEntityId: dto.contextEntityId,
        message: dto.message ?? 'Hi, I would like to discuss this request with you.',
      });
    }

    return this.create(senderAccountId, {
      vendorAccountId: dto.vendorAccountId,
      context: dto.context,
      contextEntityId: dto.contextEntityId,
      message: dto.message ?? 'Hi, I would like to discuss this request.',
    });
  }

  private async createFromVendor(vendorAccountId: string, userAccountId: string, dto: {
    context: string;
    contextEntityId?: string;
    message: string;
  }) {
    const context = dto.context as ConversationContext;

    const conversation = await this.prisma.conversation.create({
      data: {
        userAccountId,
        vendorAccountId,
        context,
        contextEntityId: dto.contextEntityId ?? null,
        vehicleId: null,
        messages: {
          create: {
            senderAccountId: vendorAccountId,
            body: dto.message,
          },
        },
      },
      include: {
        messages: true,
        vehicle: { select: { id: true, title: true, brand: true, model: true } },
      },
    });

    await this.notificationsService.createNotification({
      accountId: userAccountId,
      title: 'New message from vendor',
      body: dto.message.slice(0, 120),
      type: NotificationType.CONVERSATION_NEW,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: conversation.id,
    });

    const userAccount = await this.prisma.account.findUnique({
      where: { id: userAccountId },
      select: { email: true },
    });

    if (userAccount) {
      await this.mailService.sendMail({
        to: userAccount.email,
        subject: '[CarMesh] New vendor message',
        html: `
          <h3>New message from a vendor</h3>
          <p>${dto.message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p>Log in to your CarMesh account to reply.</p>
        `,
      }).catch(() => {});
    }

    return conversation;
  }

  async getMyConversations(accountId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { role: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const where = account.role === Role.VENDOR
      ? { vendorAccountId: accountId }
      : { userAccountId: accountId };

    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          userAccount: { select: { email: true, user: { select: { firstName: true, lastName: true } } } },
          vendorAccount: { select: { email: true, vendor: { select: { businessName: true } } } },
          vehicle: { select: { id: true, title: true, brand: true, model: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getById(conversationId: string, requestingAccountId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { senderAccount: { select: { email: true, role: true } } },
        },
        userAccount: { select: { email: true, user: { select: { firstName: true, lastName: true } } } },
        vendorAccount: { select: { email: true, vendor: { select: { businessName: true } } } },
        vehicle: { select: { id: true, title: true, brand: true, model: true } },
      },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');

    if (
      requestingAccountId !== conversation.userAccountId &&
      requestingAccountId !== conversation.vendorAccountId
    ) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.conversationMessage.updateMany({
      where: {
        conversationId,
        senderAccountId: { not: requestingAccountId },
        isRead: false,
      },
      data: { isRead: true },
    });

    return conversation;
  }

  async sendMessage(conversationId: string, senderAccountId: string, body: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.isClosed) throw new ForbiddenException('Conversation is closed');

    if (
      senderAccountId !== conversation.userAccountId &&
      senderAccountId !== conversation.vendorAccountId
    ) {
      throw new ForbiddenException('You are not a participant');
    }

    const message = await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        senderAccountId,
        body,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const isUserSender = senderAccountId === conversation.userAccountId;
    const recipientId = isUserSender
      ? conversation.vendorAccountId
      : conversation.userAccountId;

    await this.notificationsService.createNotification({
      accountId: recipientId,
      title: isUserSender ? 'New customer message' : 'New vendor reply',
      body: body.slice(0, 120),
      type: NotificationType.CONVERSATION_MESSAGE_RECEIVED,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: conversationId,
    });

    const recipient = await this.prisma.account.findUnique({
      where: { id: recipientId },
      select: { email: true },
    });

    if (recipient) {
      await this.mailService.sendMail({
        to: recipient.email,
        subject: '[CarMesh] New message in your conversation',
        html: `
          <p>You have a new message:</p>
          <p>${body.replace(/\n/g, '<br>')}</p>
          <hr>
          <p>Log in to your CarMesh account to reply.</p>
        `,
      }).catch(() => {});
    }

    return message;
  }

  async closeConversation(conversationId: string, accountId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');

    if (
      accountId !== conversation.userAccountId &&
      accountId !== conversation.vendorAccountId
    ) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { isClosed: true },
    });
  }
}
