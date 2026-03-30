import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, VendorVerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';

type AccountVendorRow = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  vendor: {
    id: string;
    accountId: string;
    businessName: string;
    contactPersonName: string;
    phoneNumber: string | null;
    businessAddress: string | null;
    logoUrl: string | null;
    verificationStatus: VendorVerificationStatus;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

@Injectable()
export class VendorProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(accountId: string) {
    const account = await this.loadVendorAccount(accountId);
    return this.toProfileResponse(account);
  }

  async updateProfile(accountId: string, dto: UpdateVendorProfileDto) {
    const account = await this.loadVendorAccount(accountId);
    const vendorId = account.vendor!.id;

    const data: {
      businessName?: string;
      contactPersonName?: string;
      phoneNumber?: string | null;
      businessAddress?: string | null;
      logoUrl?: string | null;
    } = {};

    if (dto.businessName !== undefined) {
      data.businessName = dto.businessName.trim();
    }
    if (dto.contactPersonName !== undefined) {
      data.contactPersonName = dto.contactPersonName.trim();
    }
    if (dto.phoneNumber !== undefined) {
      const t = dto.phoneNumber.trim();
      data.phoneNumber = t === '' ? null : t;
    }
    if (dto.businessAddress !== undefined) {
      const t = dto.businessAddress.trim();
      data.businessAddress = t === '' ? null : t;
    }
    if (dto.logoUrl !== undefined) {
      const t = dto.logoUrl.trim();
      data.logoUrl = t === '' ? null : t;
    }

    if (Object.keys(data).length === 0) {
      return this.toProfileResponse(account);
    }

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data,
    });

    const updated = await this.loadVendorAccount(accountId);
    return this.toProfileResponse(updated);
  }

  async getDashboard(accountId: string) {
    const account = await this.loadVendorAccount(accountId);
    const v = account.vendor!;
    const completion = this.computeProfileCompletion(account, v);

    return {
      greeting: {
        businessName: v.businessName,
        contactPersonName: v.contactPersonName,
        email: account.email,
        logoUrl: v.logoUrl,
      },
      accountSummary: {
        role: account.role,
        isActive: account.isActive,
        verificationStatus: v.verificationStatus,
        memberSince: account.createdAt,
      },
      profileCompletion: completion,
      quickActions: [
        {
          id: 'edit-profile',
          label: 'Edit profile',
          path: '/vendor/profile',
        },
      ],
    };
  }

  private async loadVendorAccount(accountId: string): Promise<AccountVendorRow> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        vendor: {
          select: {
            id: true,
            accountId: true,
            businessName: true,
            contactPersonName: true,
            phoneNumber: true,
            businessAddress: true,
            logoUrl: true,
            verificationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!account || account.role !== Role.VENDOR) {
      throw new NotFoundException('Vendor profile not found');
    }
    if (!account.vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return account as AccountVendorRow;
  }

  private toProfileResponse(account: AccountVendorRow) {
    const v = account.vendor!;
    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      businessName: v.businessName,
      contactPersonName: v.contactPersonName,
      phoneNumber: v.phoneNumber,
      businessAddress: v.businessAddress,
      logoUrl: v.logoUrl,
      verificationStatus: v.verificationStatus,
      accountCreatedAt: account.createdAt,
      accountUpdatedAt: account.updatedAt,
      profileCreatedAt: v.createdAt,
      profileUpdatedAt: v.updatedAt,
    };
  }

  private computeProfileCompletion(
    account: { email: string },
    vendor: {
      businessName: string;
      contactPersonName: string;
      phoneNumber: string | null;
      businessAddress: string | null;
      logoUrl: string | null;
    },
  ) {
    const checks: { key: string; filled: boolean }[] = [
      { key: 'businessName', filled: vendor.businessName.trim().length > 0 },
      {
        key: 'contactPersonName',
        filled: vendor.contactPersonName.trim().length > 0,
      },
      { key: 'email', filled: account.email.trim().length > 0 },
      {
        key: 'phoneNumber',
        filled: (vendor.phoneNumber ?? '').trim().length > 0,
      },
      {
        key: 'businessAddress',
        filled: (vendor.businessAddress ?? '').trim().length > 0,
      },
      {
        key: 'logoUrl',
        filled: (vendor.logoUrl ?? '').trim().length > 0,
      },
    ];
    const completedFields = checks.filter((c) => c.filled).map((c) => c.key);
    const missingFields = checks.filter((c) => !c.filled).map((c) => c.key);
    const percentage = Math.round((completedFields.length / 6) * 100);
    return { percentage, completedFields, missingFields };
  }
}
