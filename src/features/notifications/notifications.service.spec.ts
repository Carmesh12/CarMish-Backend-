import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let prisma: {
    notification: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    service = new NotificationsService(prisma as never);
  });

  it('returns account notifications newest first', async () => {
    prisma.notification.findMany.mockResolvedValue([]);

    await expect(service.findMyNotifications('account-1')).resolves.toEqual([]);
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('marks one owned notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      accountId: 'account-1',
    });
    prisma.notification.update.mockResolvedValue({ id: 'notification-1' });

    await service.markAsRead('account-1', 'notification-1');

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: { isRead: true },
    });
  });

  it('rejects marking another account notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      accountId: 'account-2',
    });

    await expect(
      service.markAsRead('account-1', 'notification-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('rejects marking a missing notification as read', async () => {
    prisma.notification.findUnique.mockResolvedValue(null);

    await expect(
      service.markAsRead('account-1', 'missing'),
    ).rejects.toThrow(NotFoundException);
  });

  it('marks all unread notifications as read for one account', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    prisma.notification.findMany.mockResolvedValue([
      { id: 'notification-1', isRead: true },
      { id: 'notification-2', isRead: true },
    ]);

    const result = await service.markAllAsRead('account-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', isRead: false },
      data: { isRead: true },
    });
    expect(result).toEqual([
      { id: 'notification-1', isRead: true },
      { id: 'notification-2', isRead: true },
    ]);
  });
});
