import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const account = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
      include: {
        user: true,
        vendor: true,
        admin: true,
      },
    });

    if (!account) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!account.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, account.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(
      account.id,
      account.email,
      account.role,
    );
    const refreshToken = await this.createRefreshToken(account.id);

    return this.toAuthResponse(account, accessToken, refreshToken);
  }

  async signupUser(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phoneNumber?: string,
  ) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const existing = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const account = await this.prisma.$transaction(async (tx) => {
      return tx.account.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: Role.USER,
          user: {
            create: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phoneNumber: phoneNumber?.trim() || null,
            },
          },
        },
        include: {
          user: true,
          vendor: true,
          admin: true,
        },
      });
    });

    const accessToken = this.generateAccessToken(
      account.id,
      account.email,
      account.role,
    );
    const refreshToken = await this.createRefreshToken(account.id);

    return this.toAuthResponse(account, accessToken, refreshToken);
  }

  async signupVendor(
    email: string,
    password: string,
    businessName: string,
    contactPersonName: string,
    phoneNumber?: string,
    businessAddress?: string,
  ) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const existing = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const account = await this.prisma.$transaction(async (tx) => {
      return tx.account.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: Role.VENDOR,
          vendor: {
            create: {
              businessName: businessName.trim(),
              contactPersonName: contactPersonName.trim(),
              phoneNumber: phoneNumber?.trim() || null,
              businessAddress: businessAddress?.trim() || null,
            },
          },
        },
        include: {
          user: true,
          vendor: true,
          admin: true,
        },
      });
    });

    const accessToken = this.generateAccessToken(
      account.id,
      account.email,
      account.role,
    );
    const refreshToken = await this.createRefreshToken(account.id);

    return this.toAuthResponse(account, accessToken, refreshToken);
  }

  async refreshTokens(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { account: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!stored.account.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const accessToken = this.generateAccessToken(
      stored.account.id,
      stored.account.email,
      stored.account.role,
    );
    const newRefreshToken = await this.createRefreshToken(stored.account.id);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  async getMe(userId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: userId },
      include: {
        user: true,
        vendor: true,
        admin: true,
      },
    });

    if (!account) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      profile: this.extractProfile(account),
    };
  }

  private generateAccessToken(id: string, email: string, role: Role): string {
    return this.jwtService.sign({ sub: id, email, role });
  }

  private async createRefreshToken(accountId: string): Promise<string> {
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.refreshToken.create({
      data: { token, accountId, expiresAt },
    });

    return token;
  }

  private toAuthResponse(
    account: {
      id: string;
      email: string;
      role: Role;
      user?: any;
      vendor?: any;
      admin?: any;
    },
    accessToken: string,
    refreshToken: string,
  ) {
    return {
      accessToken,
      refreshToken,
      user: {
        id: account.id,
        email: account.email,
        role: account.role,
        profile: this.extractProfile(account),
      },
    };
  }

  private extractProfile(
    account: { role: Role; user?: any; vendor?: any; admin?: any },
  ): Record<string, unknown> | null {
    if (account.role === Role.USER && account.user) {
      const { accountId, ...rest } = account.user;
      return rest;
    }
    if (account.role === Role.VENDOR && account.vendor) {
      const { accountId, ...rest } = account.vendor;
      return rest;
    }
    if (account.role === Role.ADMIN && account.admin) {
      const { accountId, ...rest } = account.admin;
      return rest;
    }
    return null;
  }
}
