import { createHash, randomBytes, randomUUID } from 'crypto';
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
const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const DEFAULT_EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const VERIFICATION_EMAIL_SENT_MESSAGE =
  'If your email is registered and unverified, we sent a verification link.';

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

    if (!account.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
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
    phoneNumber: string,
    city: string,
    address?: string,
  ) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const existing = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const mailConfig = this.getEmailVerificationMailConfig();
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const verification = this.createEmailVerificationToken();

    const account = await this.prisma.$transaction(async (tx) => {
      return tx.account.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: Role.USER,
          emailVerified: false,
          emailVerificationTokenHash: verification.tokenHash,
          emailVerificationTokenExpiresAt: verification.expiresAt,
          user: {
            create: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phoneNumber: phoneNumber.trim(),
              city: city.trim(),
              address: address?.trim() || null,
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

    await this.sendEmailVerificationEmail(
      account.email,
      verification.token,
      mailConfig,
    );

    return {
      message:
        'Account created. Please check your email to verify your account.',
    };
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

    const mailConfig = this.getEmailVerificationMailConfig();
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const verification = this.createEmailVerificationToken();

    const account = await this.prisma.$transaction(async (tx) => {
      return tx.account.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: Role.VENDOR,
          emailVerified: false,
          emailVerificationTokenHash: verification.tokenHash,
          emailVerificationTokenExpiresAt: verification.expiresAt,
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

    await this.sendEmailVerificationEmail(
      account.email,
      verification.token,
      mailConfig,
    );

    return {
      message:
        'Account created. Please check your email to verify your account.',
    };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }

    const tokenHash = this.hashToken(token);
    const account = await this.prisma.account.findUnique({
      where: { emailVerificationTokenHash: tokenHash },
    });

    if (
      !account ||
      !account.emailVerificationTokenExpiresAt ||
      account.emailVerificationTokenExpiresAt < new Date()
    ) {
      if (account) {
        await this.prisma.account.update({
          where: { id: account.id },
          data: {
            emailVerificationTokenHash: null,
            emailVerificationTokenExpiresAt: null,
          },
        });
      }

      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerificationEmail(email: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const account = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
    });

    if (!account || !account.isActive) {
      return { message: VERIFICATION_EMAIL_SENT_MESSAGE };
    }

    if (account.emailVerified) {
      return { message: 'Email is already verified.' };
    }

    const mailConfig = this.getEmailVerificationMailConfig();
    const verification = this.createEmailVerificationToken();

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        emailVerificationTokenHash: verification.tokenHash,
        emailVerificationTokenExpiresAt: verification.expiresAt,
      },
    });

    await this.sendEmailVerificationEmail(
      account.email,
      verification.token,
      mailConfig,
    );

    return { message: VERIFICATION_EMAIL_SENT_MESSAGE };
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

    if (!stored.account.emailVerified) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
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
      emailVerified: account.emailVerified,
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
      emailVerified: boolean;
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
        emailVerified: account.emailVerified,
        profile: this.extractProfile(account),
      },
    };
  }

  private createEmailVerificationToken(): {
    token: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + this.getEmailVerificationExpiryHours(),
    );

    return {
      token,
      tokenHash: this.hashToken(token),
      expiresAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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

  private async sendEmailVerificationEmail(
    toEmail: string,
    token: string,
    mailConfig: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPass: string;
      mailFrom: string;
      verificationBaseUrl: string;
    },
  ) {
    const verificationUrl = `${mailConfig.verificationBaseUrl}?token=${encodeURIComponent(token)}`;
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
      subject: 'Verify your CarMesh email',
      text: `Welcome to CarMesh. Verify your email address using this link: ${verificationUrl}`,
      html: `
        <p>Welcome to CarMesh.</p>
        <p>Click the link below to verify your email address:</p>
        <p><a href="${verificationUrl}">Verify your email</a></p>
        <p>If you did not create this account, you can safely ignore this email.</p>
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

  private getEmailVerificationMailConfig() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPortRaw = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const mailFrom = process.env.MAIL_FROM;
    const verificationBaseUrl =
      process.env.EMAIL_VERIFICATION_BASE_URL ||
      `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/verify-email`;

    const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : NaN;

    if (
      !smtpHost ||
      !smtpPortRaw ||
      Number.isNaN(smtpPort) ||
      smtpPort <= 0 ||
      !smtpUser ||
      !smtpPass ||
      !mailFrom ||
      !verificationBaseUrl
    ) {
      throw new InternalServerErrorException(
        'Email verification service is not configured correctly',
      );
    }

    return {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      mailFrom,
      verificationBaseUrl,
    };
  }

  private getEmailVerificationExpiryHours(): number {
    const raw = process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_HOURS;
    if (!raw) {
      return DEFAULT_EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS;
    }

    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new InternalServerErrorException(
        'EMAIL_VERIFICATION_TOKEN_EXPIRES_HOURS must be a positive number',
      );
    }

    return hours;
  }
}
