import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  RelatedEntityType,
  ThreadContext,
  VendorVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminMessagingService } from '../admin-messaging/admin-messaging.service';

@Injectable()
export class AdminVendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly messagingService: AdminMessagingService,
  ) {}

  async listPendingVendors(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const where = { verificationStatus: VendorVerificationStatus.PENDING };

    const [data, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          account: { select: { id: true, email: true, createdAt: true, isActive: true } },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async listAllVendors(page = 1, limit = 10, status?: string, search?: string) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (status && Object.values(VendorVerificationStatus).includes(status as VendorVerificationStatus)) {
      where.verificationStatus = status as VendorVerificationStatus;
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { contactPersonName: { contains: search, mode: 'insensitive' } },
        { account: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          account: { select: { id: true, email: true, createdAt: true, isActive: true } },
          _count: { select: { vehicles: true, purchaseRequests: true, rentalRequests: true } },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getPendingCount() {
    return this.prisma.vendor.count({
      where: { verificationStatus: VendorVerificationStatus.PENDING },
    });
  }

  async approveVendor(adminAccountId: string, vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { account: { select: { id: true, email: true } } },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { verificationStatus: VendorVerificationStatus.APPROVED },
    });

    await this.notificationsService.createNotification({
      accountId: vendor.account.id,
      title: 'Account Approved',
      body: 'Your vendor account has been approved. You can now publish vehicle listings.',
      type: NotificationType.VENDOR_APPROVED,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: vendorId,
    });

    await this.mailService.sendMail({
      to: vendor.account.email,
      subject: 'CarMesh - Your Vendor Account Has Been Approved',
      html: `
        <h2>Congratulations!</h2>
        <p>Your vendor account <strong>${vendor.businessName}</strong> has been approved on CarMesh.</p>
        <p>You can now log in and start publishing your vehicle listings.</p>
        <p>Welcome to the CarMesh marketplace!</p>
      `,
    }).catch(() => {});

    return { message: 'Vendor approved successfully' };
  }

  async rejectVendor(adminAccountId: string, vendorId: string, reason?: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { account: { select: { id: true, email: true } } },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { verificationStatus: VendorVerificationStatus.REJECTED },
    });

    const reasonText = reason ? ` Reason: ${reason}` : '';

    await this.notificationsService.createNotification({
      accountId: vendor.account.id,
      title: 'Account Rejected',
      body: `Your vendor account application has been rejected.${reasonText}`,
      type: NotificationType.VENDOR_REJECTED,
      relatedEntityType: RelatedEntityType.OTHER,
      relatedEntityId: vendorId,
    });

    await this.mailService.sendMail({
      to: vendor.account.email,
      subject: 'CarMesh - Vendor Account Application Update',
      html: `
        <h2>Vendor Account Application</h2>
        <p>Unfortunately, your vendor account application for <strong>${vendor.businessName}</strong> has been rejected.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>If you believe this is an error, please contact our support team.</p>
      `,
    }).catch(() => {});

    return { message: 'Vendor rejected successfully' };
  }

  async messageVendor(
    adminAccountId: string,
    vendorId: string,
    subject: string,
    body: string,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { account: { select: { id: true, email: true } } },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');

    return this.messagingService.createThread({
      adminAccountId,
      vendorAccountId: vendor.account.id,
      subject,
      body,
      context: ThreadContext.VENDOR_VERIFICATION,
      contextEntityId: vendorId,
    });
  }
}
