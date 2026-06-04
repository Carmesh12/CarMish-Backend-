import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, RelatedEntityType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listAccounts(
    page = 1,
    limit = 10,
    role?: string,
    isActive?: string,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (role && Object.values(Role).includes(role as Role)) {
      where.role = role as Role;
    }
    if (isActive === 'true') where.isActive = true;
    if (isActive === 'false') where.isActive = false;
    if (search) {
      where.email = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          vendor: { select: { businessName: true, verificationStatus: true } },
          admin: { select: { firstName: true, lastName: true } },
          _count: { select: { reports: true } },
        },
      }),
      this.prisma.account.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getAccountDetails(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        user: true,
        vendor: true,
        admin: true,
        _count: { select: { reports: true, notifications: true } },
      },
    });

    if (!account) throw new NotFoundException('Account not found');

    const reportCount = await this.prisma.report.count({
      where: {
        vehicle: {
          vendor: { accountId },
        },
      },
    });

    return { ...account, vehicleReportCount: reportCount };
  }

  async deactivateAccount(adminAccountId: string, targetAccountId: string, reason?: string) {
    if (adminAccountId === targetAccountId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: targetAccountId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!account) throw new NotFoundException('Account not found');
    if (account.role === Role.ADMIN) {
      throw new BadRequestException('Cannot deactivate another admin account');
    }
    if (!account.isActive) {
      throw new BadRequestException('Account is already deactivated');
    }

    await this.prisma.account.update({
      where: { id: targetAccountId },
      data: { isActive: false },
    });

    await this.notificationsService.createNotification({
      accountId: targetAccountId,
      title: 'Account Deactivated',
      body: reason
        ? `Your account has been deactivated. Reason: ${reason}`
        : 'Your account has been deactivated by an administrator.',
      type: NotificationType.ACCOUNT_DEACTIVATED,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: targetAccountId,
    });

    await this.mailService.sendMail({
      to: account.email,
      subject: 'CarMesh - Account Deactivated',
      html: `
        <h2>Account Deactivated</h2>
        <p>Your CarMesh account has been deactivated by an administrator.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>If you believe this is an error, please contact our support team.</p>
      `,
    }).catch(() => {});

    return { message: 'Account deactivated successfully' };
  }

  async activateAccount(adminAccountId: string, targetAccountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: targetAccountId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!account) throw new NotFoundException('Account not found');
    if (account.isActive) {
      throw new BadRequestException('Account is already active');
    }

    await this.prisma.account.update({
      where: { id: targetAccountId },
      data: { isActive: true },
    });

    await this.notificationsService.createNotification({
      accountId: targetAccountId,
      title: 'Account Reactivated',
      body: 'Your account has been reactivated. You can now log in again.',
      type: NotificationType.ACCOUNT_ACTIVATED,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: targetAccountId,
    });

    await this.mailService.sendMail({
      to: account.email,
      subject: 'CarMesh - Account Reactivated',
      html: `
        <h2>Account Reactivated</h2>
        <p>Your CarMesh account has been reactivated. You can now log in and use the platform.</p>
      `,
    }).catch(() => {});

    return { message: 'Account activated successfully' };
  }
}
