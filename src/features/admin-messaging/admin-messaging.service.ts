import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  NotificationType,
  RelatedEntityType,
  Role,
  ThreadContext,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../../common/mail/mail.service';

@Injectable()
export class AdminMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async createThread(data: {
    adminAccountId: string;
    vendorAccountId: string;
    subject: string;
    body: string;
    context: ThreadContext;
    contextEntityId?: string;
  }) {
    const thread = await this.prisma.adminVendorThread.create({
      data: {
        adminAccountId: data.adminAccountId,
        vendorAccountId: data.vendorAccountId,
        subject: data.subject,
        context: data.context,
        contextEntityId: data.contextEntityId ?? null,
        messages: {
          create: {
            senderAccountId: data.adminAccountId,
            body: data.body,
          },
        },
      },
      include: { messages: true },
    });

    const vendorAccount = await this.prisma.account.findUnique({
      where: { id: data.vendorAccountId },
      select: { email: true },
    });

    if (vendorAccount) {
      await this.notificationsService.createNotification({
        accountId: data.vendorAccountId,
        title: 'New message from Admin',
        body: `Subject: ${data.subject}`,
        type: NotificationType.ADMIN_MESSAGE_RECEIVED,
        relatedEntityType: RelatedEntityType.OTHER,
        relatedEntityId: thread.id,
      });

      await this.mailService
        .sendMail({
          to: vendorAccount.email,
          subject: `[CarMesh Admin] ${data.subject}`,
          html: `
          <h3>Message from CarMesh Admin</h3>
          <p><strong>Subject:</strong> ${data.subject}</p>
          <p>${data.body.replace(/\n/g, '<br>')}</p>
          <hr>
          <p>Log in to your CarMesh account to reply.</p>
        `,
        })
        .catch(() => {});
    }

    return thread;
  }

  async replyToThread(data: {
    threadId: string;
    senderAccountId: string;
    body: string;
  }) {
    const thread = await this.prisma.adminVendorThread.findUnique({
      where: { id: data.threadId },
    });

    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.isClosed) throw new ForbiddenException('Thread is closed');

    if (
      data.senderAccountId !== thread.adminAccountId &&
      data.senderAccountId !== thread.vendorAccountId
    ) {
      throw new ForbiddenException('You are not a participant in this thread');
    }

    const message = await this.prisma.adminVendorMessage.create({
      data: {
        threadId: data.threadId,
        senderAccountId: data.senderAccountId,
        body: data.body,
      },
    });

    const isAdminSender = data.senderAccountId === thread.adminAccountId;
    const recipientId = isAdminSender
      ? thread.vendorAccountId
      : thread.adminAccountId;
    const sender = await this.prisma.account.findUnique({
      where: { id: data.senderAccountId },
      select: { role: true },
    });

    await this.notificationsService.createNotification({
      accountId: recipientId,
      title: isAdminSender
        ? 'New message from Admin'
        : sender?.role === Role.USER
          ? 'New user reply'
          : 'New vendor reply',
      body: data.body.slice(0, 120),
      type: isAdminSender
        ? NotificationType.ADMIN_MESSAGE_RECEIVED
        : NotificationType.VENDOR_MESSAGE_RECEIVED,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: thread.id,
    });

    const recipient = await this.prisma.account.findUnique({
      where: { id: recipientId },
      select: { email: true },
    });

    if (recipient) {
      await this.mailService
        .sendMail({
          to: recipient.email,
          subject: `[CarMesh] Re: ${thread.subject}`,
          html: `
          <p>New reply in thread: <strong>${thread.subject}</strong></p>
          <p>${data.body.replace(/\n/g, '<br>')}</p>
          <hr>
          <p>Log in to your CarMesh account to view the full conversation.</p>
        `,
        })
        .catch(() => {});
    }

    return message;
  }

  async getThreadsByVendor(vendorAccountId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.adminVendorThread.findMany({
        where: { vendorAccountId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          adminAccount: {
            select: {
              email: true,
              admin: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.adminVendorThread.count({ where: { vendorAccountId } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getThreadById(threadId: string, requestingAccountId: string) {
    const thread = await this.prisma.adminVendorThread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            senderAccount: {
              select: {
                email: true,
                role: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    profileImageUrl: true,
                  },
                },
                vendor: {
                  select: {
                    businessName: true,
                    logoUrl: true,
                  },
                },
                admin: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        adminAccount: {
          select: {
            email: true,
            admin: { select: { firstName: true, lastName: true } },
          },
        },
        vendorAccount: {
          select: {
            email: true,
            role: true,
            user: { select: { firstName: true, lastName: true } },
            vendor: { select: { businessName: true } },
          },
        },
      },
    });

    if (!thread) throw new NotFoundException('Thread not found');

    const account = await this.prisma.account.findUnique({
      where: { id: requestingAccountId },
      select: { role: true },
    });

    if (
      account?.role !== Role.ADMIN &&
      requestingAccountId !== thread.vendorAccountId
    ) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.adminVendorMessage.updateMany({
      where: {
        threadId,
        senderAccountId: { not: requestingAccountId },
        isRead: false,
      },
      data: { isRead: true },
    });

    await this.prisma.notification.updateMany({
      where: {
        accountId: requestingAccountId,
        relatedEntityId: threadId,
        type: {
          in: [
            NotificationType.ADMIN_MESSAGE_RECEIVED,
            NotificationType.VENDOR_MESSAGE_RECEIVED,
          ],
        },
        isRead: false,
      },
      data: { isRead: true },
    });

    return {
      ...thread,
      messages: thread.messages.map((message) =>
        !message.isRead && message.senderAccountId !== requestingAccountId
          ? { ...message, isRead: true }
          : message,
      ),
    };
  }

  async getMyThreads(accountId: string, role: Role, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where =
      role === Role.ADMIN
        ? { adminAccountId: accountId }
        : { vendorAccountId: accountId };

    const [data, total] = await Promise.all([
      this.prisma.adminVendorThread.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          vendorAccount: {
            select: {
              email: true,
              role: true,
              user: { select: { firstName: true, lastName: true } },
              vendor: { select: { businessName: true } },
            },
          },
          adminAccount: { select: { email: true } },
        },
      }),
      this.prisma.adminVendorThread.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async closeThread(threadId: string, adminAccountId: string) {
    const thread = await this.prisma.adminVendorThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.adminAccountId !== adminAccountId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.adminVendorThread.update({
      where: { id: threadId },
      data: { isClosed: true },
    });
  }
}
