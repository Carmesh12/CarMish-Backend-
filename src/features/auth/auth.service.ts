import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import { PasswordResetPayload } from './interfaces/password-reset-payload.interface';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const BCRYPT_SALT_ROUNDS = 10;
const PASSWORD_RESET_TOKEN_TYPE = 'password_reset';

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

    const isPasswordValid = await bcrypt.compare(
      password,
      account.passwordHash,
    );
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

  async forgotPassword(email: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();
    const mailConfig = this.getPasswordResetMailConfig();

    const account = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
    });

    // Avoid leaking whether an email exists or is active.
    if (!account || !account.isActive) {
      return {
        message: 'If your email is registered, we sent a password reset link.',
      };
    }

    const token = this.jwtService.sign(
      {
        sub: account.id,
        email: account.email,
        type: PASSWORD_RESET_TOKEN_TYPE,
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      { expiresIn: mailConfig.tokenExpiresIn as any },
    );

    const resetUrl = `${mailConfig.resetBaseUrl}?token=${encodeURIComponent(token)}`;
    await this.sendPasswordResetEmail(account.email, resetUrl, mailConfig);

    return {
      message: 'If your email is registered, we sent a password reset link.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }

    let payload: PasswordResetPayload;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== PASSWORD_RESET_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid token');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
    });

    if (!account || !account.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { passwordHash },
      });

      // Invalidate all sessions for this account.
      await tx.refreshToken.deleteMany({
        where: { accountId: account.id },
      });
    });

    return { message: 'Password updated successfully' };
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
      user?: ({ accountId: string } & Record<string, unknown>) | null;
      vendor?: ({ accountId: string } & Record<string, unknown>) | null;
      admin?: ({ accountId: string } & Record<string, unknown>) | null;
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

  private extractProfile(account: {
    role: Role;
    user?: ({ accountId: string } & Record<string, unknown>) | null;
    vendor?: ({ accountId: string } & Record<string, unknown>) | null;
    admin?: ({ accountId: string } & Record<string, unknown>) | null;
  }): Record<string, unknown> | null {
    if (account.role === Role.USER && account.user) {
      const { accountId, ...rest } = account.user;
      void accountId; // remove Prisma join field
      return rest;
    }
    if (account.role === Role.VENDOR && account.vendor) {
      const { accountId, ...rest } = account.vendor;
      void accountId; // remove Prisma join field
      return rest;
    }
    if (account.role === Role.ADMIN && account.admin) {
      const { accountId, ...rest } = account.admin;
      void accountId; // remove Prisma join field
      return rest;
    }
    return null;
  }

  private async sendPasswordResetEmail(
    toEmail: string,
    resetUrl: string,
    mailConfig: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPass: string;
      mailFrom: string;
      resetBaseUrl: string;
      tokenExpiresIn: string;
    },
  ) {
    const secure = mailConfig.smtpPort === 465;
    const transporter = nodemailer.createTransport({
      host: mailConfig.smtpHost,
      port: mailConfig.smtpPort,
      secure,
      auth: {
        user: mailConfig.smtpUser,
        pass: mailConfig.smtpPass,
      },
    });

    await transporter.sendMail({
      from: mailConfig.mailFrom,
      to: toEmail,
      subject: 'CarMesh Password Reset Request',
      text: `We received a request to reset your CarMesh password. Use this link to continue: ${resetUrl}`,
      html: `
        <p>We received a request to reset your CarMesh password.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
    });
  }

  private getPasswordResetMailConfig() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPortRaw = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const mailFrom = process.env.MAIL_FROM;
    const resetBaseUrl = process.env.RESET_PASSWORD_BASE_URL;
    const tokenExpiresIn = process.env.PASSWORD_RESET_TOKEN_EXPIRES ?? '15m';

    const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : NaN;

    if (
      !smtpHost ||
      !smtpPortRaw ||
      Number.isNaN(smtpPort) ||
      smtpPort <= 0 ||
      !smtpUser ||
      !smtpPass ||
      !mailFrom ||
      !resetBaseUrl
    ) {
      throw new InternalServerErrorException(
        'Password reset email service is not configured correctly',
      );
    }

    return {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      mailFrom,
      resetBaseUrl,
      tokenExpiresIn,
    };
  }
}
