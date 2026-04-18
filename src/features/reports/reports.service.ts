import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findAllForAdmin(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const take = limit;

    const [data, total] = await Promise.all([
      this.prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
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
      this.prisma.report.count()
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async updateStatus(adminAccountId: string, reportId: string, dto: UpdateReportStatusDto) {
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
