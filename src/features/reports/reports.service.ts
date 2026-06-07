import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ReportStatus,
  ThreadContext,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminMessagingService } from '../admin-messaging/admin-messaging.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: AdminMessagingService,
  ) {}

  async create(accountId: string, dto: CreateReportDto) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const existingReport = await this.prisma.report.findFirst({
      where: {
        reporterAccountId: accountId,
        vehicleId: dto.vehicleId,
      },
    });

    if (existingReport) {
      throw new BadRequestException('You have already reported this vehicle');
    }

    return this.prisma.report.create({
      data: {
        reporterAccountId: accountId,
        vehicleId: dto.vehicleId,
        reason: dto.reason,
        description: dto.description,
      },
    });
  }

  async findAllForAdmin(
    page = 1,
    limit = 10,
    status?: string,
    vehicleId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (
      status &&
      Object.values(ReportStatus).includes(status as ReportStatus)
    ) {
      where.status = status as ReportStatus;
    }
    if (vehicleId) {
      where.vehicleId = vehicleId;
    }

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          vehicle: {
            select: {
              title: true,
              brand: true,
            },
          },
          reporterAccount: {
            select: {
              email: true,
            },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findGroupedForAdmin(status?: string) {
    const where: Record<string, unknown> = {};
    if (
      status &&
      Object.values(ReportStatus).includes(status as ReportStatus)
    ) {
      where.status = status as ReportStatus;
    }

    const reports = await this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: {
          select: {
            id: true,
            title: true,
            brand: true,
            model: true,
            listingStatus: true,
            vendor: {
              select: {
                id: true,
                businessName: true,
                accountId: true,
              },
            },
          },
        },
        reporterAccount: { select: { email: true } },
      },
    });

    const grouped = new Map<
      string,
      {
        vehicleId: string;
        vehicleTitle: string;
        vehicleBrand: string;
        vehicleModel: string;
        listingStatus: string;
        vendorId: string;
        vendorName: string;
        vendorAccountId: string;
        reportCount: number;
        pendingCount: number;
        latestReportDate: Date;
        severity: 'low' | 'medium' | 'high';
        reports: typeof reports;
      }
    >();

    for (const report of reports) {
      const key = report.vehicleId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          vehicleId: report.vehicle.id,
          vehicleTitle: report.vehicle.title,
          vehicleBrand: report.vehicle.brand,
          vehicleModel: report.vehicle.model,
          listingStatus: report.vehicle.listingStatus,
          vendorId: report.vehicle.vendor.id,
          vendorName: report.vehicle.vendor.businessName,
          vendorAccountId: report.vehicle.vendor.accountId,
          reportCount: 0,
          pendingCount: 0,
          latestReportDate: report.createdAt,
          severity: 'low',
          reports: [],
        });
      }
      const group = grouped.get(key)!;
      group.reportCount += 1;
      if (report.status === ReportStatus.PENDING) group.pendingCount += 1;
      if (report.createdAt > group.latestReportDate) {
        group.latestReportDate = report.createdAt;
      }
      group.reports.push(report);
    }

    for (const group of grouped.values()) {
      if (group.reportCount >= 6) group.severity = 'high';
      else if (group.reportCount >= 3) group.severity = 'medium';
      else group.severity = 'low';
    }

    const result = Array.from(grouped.values()).sort(
      (a, b) => b.reportCount - a.reportCount,
    );

    return {
      data: result,
      meta: { totalVehicles: result.length, totalReports: reports.length },
    };
  }

  async resolveAllForVehicle(adminAccountId: string, vehicleId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { accountId: adminAccountId },
    });
    if (!admin) throw new NotFoundException('Admin profile not found');

    const result = await this.prisma.report.updateMany({
      where: {
        vehicleId,
        status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWED] },
      },
      data: {
        status: ReportStatus.RESOLVED,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
      },
    });

    return { message: `${result.count} reports resolved` };
  }

  async dismissAllForVehicle(adminAccountId: string, vehicleId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { accountId: adminAccountId },
    });
    if (!admin) throw new NotFoundException('Admin profile not found');

    const result = await this.prisma.report.updateMany({
      where: {
        vehicleId,
        status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWED] },
      },
      data: {
        status: ReportStatus.DISMISSED,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
      },
    });

    return { message: `${result.count} reports dismissed` };
  }

  async hideVehicleListing(adminAccountId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { listingStatus: VehicleListingStatus.HIDDEN },
    });

    return { message: 'Vehicle listing hidden' };
  }

  async discussWithVendor(
    adminAccountId: string,
    vehicleId: string,
    subject: string,
    body: string,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { vendor: { select: { accountId: true } } },
    });

    if (!vehicle) throw new NotFoundException('Vehicle not found');

    return this.messagingService.createThread({
      adminAccountId,
      vendorAccountId: vehicle.vendor.accountId,
      subject,
      body,
      context: ThreadContext.REPORT_DISCUSSION,
      contextEntityId: vehicleId,
    });
  }

  async updateStatus(
    adminAccountId: string,
    reportId: string,
    dto: UpdateReportStatusDto,
  ) {
    const admin = await this.prisma.admin.findUnique({
      where: { accountId: adminAccountId },
    });

    if (!admin) {
      throw new NotFoundException('Admin profile not found');
    }

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
      },
    });
  }
}
