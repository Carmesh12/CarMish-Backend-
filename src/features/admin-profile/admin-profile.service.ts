import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

type AccountAdminRow = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  admin: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

@Injectable()
export class AdminProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(accountId: string) {
    const account = await this.loadAdminAccount(accountId);
    return this.toProfileResponse(account);
  }

  async updateProfile(accountId: string, dto: UpdateAdminProfileDto) {
    const account = await this.loadAdminAccount(accountId);
    const adminId = account.admin!.id;

    const data: { firstName?: string; lastName?: string } = {};

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
    }

    if (Object.keys(data).length === 0) {
      return this.toProfileResponse(account);
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data,
    });

    const updated = await this.loadAdminAccount(accountId);
    return this.toProfileResponse(updated);
  }

  async getDashboard(accountId: string) {
    const account = await this.loadAdminAccount(accountId);
    const a = account.admin!;
    const fullName = `${a.firstName} ${a.lastName}`.trim();
    const completion = this.computeProfileCompletion(account, a);

    return {
      greeting: {
        fullName,
        email: account.email,
      },
      accountSummary: {
        role: account.role,
        isActive: account.isActive,
        memberSince: account.createdAt,
      },
      profileCompletion: completion,
      quickActions: [
        {
          id: 'edit-profile',
          label: 'Edit profile',
          path: '/admin/profile',
        },
      ],
    };
  }

  private async loadAdminAccount(accountId: string): Promise<AccountAdminRow> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        admin: {
          select: {
            id: true,
            accountId: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!account || account.role !== Role.ADMIN) {
      throw new NotFoundException('Admin profile not found');
    }
    if (!account.admin) {
      throw new NotFoundException('Admin profile not found');
    }

    return account as AccountAdminRow;
  }

  private toProfileResponse(account: AccountAdminRow) {
    const a = account.admin!;
    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      firstName: a.firstName,
      lastName: a.lastName,
      accountCreatedAt: account.createdAt,
      accountUpdatedAt: account.updatedAt,
      profileCreatedAt: a.createdAt,
      profileUpdatedAt: a.updatedAt,
    };
  }

  private computeProfileCompletion(
    account: { email: string },
    admin: { firstName: string; lastName: string },
  ) {
    const checks: { key: string; filled: boolean }[] = [
      { key: 'firstName', filled: admin.firstName.trim().length > 0 },
      { key: 'lastName', filled: admin.lastName.trim().length > 0 },
      { key: 'email', filled: account.email.trim().length > 0 },
    ];
    const completedFields = checks.filter((c) => c.filled).map((c) => c.key);
    const missingFields = checks.filter((c) => !c.filled).map((c) => c.key);
    const percentage = Math.round((completedFields.length / 3) * 100);
    return { percentage, completedFields, missingFields };
  }
}
