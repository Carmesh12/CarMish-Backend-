import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, RelatedEntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(data: {
    accountId: string;
    title: string;
    body: string;
    type: NotificationType;
    relatedEntityType?: RelatedEntityType;
    relatedEntityId?: string;
  }) {
    return this.prisma.notification.create({
      data: {
        accountId: data.accountId,
        title: data.title,
        body: data.body,
        type: data.type,
        relatedEntityType: data.relatedEntityType ?? null,
        relatedEntityId: data.relatedEntityId ?? null,
      },
    });
  }

  async findMyNotifications(accountId: string) {
    return this.prisma.notification.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(accountId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.accountId !== accountId) {
      throw new ForbiddenException(
        'You are not allowed to update this notification',
      );
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }
}
