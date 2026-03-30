import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

const BCRYPT_SALT_ROUNDS = 10;

type AccountUserRow = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
    profileImageUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getProfile(accountId: string) {
    const account = await this.loadUserAccount(accountId);
    return this.toProfileResponse(account);
  }

  async updateProfile(accountId: string, dto: UpdateUserProfileDto) {
    const account = await this.loadUserAccount(accountId);
    const userId = account.user!.id;

    const data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string | null;
    } = {};

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
    }
    if (dto.phoneNumber !== undefined) {
      const t = dto.phoneNumber.trim();
      data.phoneNumber = t === '' ? null : t;
    }

    if (Object.keys(data).length === 0) {
      return this.toProfileResponse(account);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    const updated = await this.loadUserAccount(accountId);
    return this.toProfileResponse(updated);
  }

  async changePassword(accountId: string, dto: ChangeUserPasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, passwordHash: true, role: true },
    });

    if (!account || account.role !== Role.USER) {
      throw new NotFoundException('User profile not found');
    }

    const currentOk = await bcrypt.compare(
      dto.currentPassword,
      account.passwordHash,
    );
    if (!currentOk) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully' };
  }

  async updateProfileImage(
    accountId: string,
    file: Express.Multer.File,
  ): Promise<{ message: string; profileImageUrl: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }

    const account = await this.loadUserAccount(accountId);
    const userId = account.user!.id;

    let profileImageUrl: string;
    try {
      profileImageUrl = await this.cloudinaryService.uploadImageBuffer(
        file.buffer,
      );
    } catch {
      throw new InternalServerErrorException('Could not upload image');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
    });

    return {
      message: 'Profile image uploaded successfully',
      profileImageUrl,
    };
  }

  async getDashboard(accountId: string) {
    const account = await this.loadUserAccount(accountId);
    const user = account.user!;
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    const completion = this.computeProfileCompletion(account, user);

    return {
      greeting: {
        fullName,
        email: account.email,
        profileImageUrl: user.profileImageUrl,
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
          path: '/user/profile',
        },
        {
          id: 'change-password',
          label: 'Change password',
          path: '/user/profile/password',
        },
      ],
    };
  }

  private async loadUserAccount(accountId: string): Promise<AccountUserRow> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            accountId: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            profileImageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!account || account.role !== Role.USER) {
      throw new NotFoundException('User profile not found');
    }
    if (!account.user) {
      throw new NotFoundException('User profile not found');
    }

    return account as AccountUserRow;
  }

  private toProfileResponse(account: AccountUserRow) {
    const u = account.user!;
    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      firstName: u.firstName,
      lastName: u.lastName,
      phoneNumber: u.phoneNumber,
      profileImageUrl: u.profileImageUrl,
      accountCreatedAt: account.createdAt,
      accountUpdatedAt: account.updatedAt,
      profileCreatedAt: u.createdAt,
      profileUpdatedAt: u.updatedAt,
    };
  }

  private computeProfileCompletion(
    account: { email: string },
    user: {
      firstName: string;
      lastName: string;
      phoneNumber: string | null;
      profileImageUrl: string | null;
    },
  ) {
    const checks: { key: string; filled: boolean }[] = [
      { key: 'firstName', filled: user.firstName.trim().length > 0 },
      { key: 'lastName', filled: user.lastName.trim().length > 0 },
      { key: 'email', filled: account.email.trim().length > 0 },
      {
        key: 'phoneNumber',
        filled: (user.phoneNumber ?? '').trim().length > 0,
      },
      {
        key: 'profileImageUrl',
        filled: (user.profileImageUrl ?? '').trim().length > 0,
      },
    ];
    const completedFields = checks.filter((c) => c.filled).map((c) => c.key);
    const missingFields = checks.filter((c) => !c.filled).map((c) => c.key);
    const percentage = Math.round((completedFields.length / 5) * 100);
    return { percentage, completedFields, missingFields };
  }
}
