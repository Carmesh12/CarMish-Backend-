import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

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

    const payload = { sub: account.id, email: account.email, role: account.role };
    const token = this.jwtService.sign(payload);

    let profile: Record<string, unknown> | null = null;
    if (account.role === Role.USER && account.user) {
      const { accountId, ...rest } = account.user;
      profile = rest;
    } else if (account.role === Role.VENDOR && account.vendor) {
      const { accountId, ...rest } = account.vendor;
      profile = rest;
    } else if (account.role === Role.ADMIN && account.admin) {
      const { accountId, ...rest } = account.admin;
      profile = rest;
    }

    return {
      token,
      user: {
        id: account.id,
        email: account.email,
        role: account.role,
        profile,
      },
    };
  }

  async getMeByToken(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    let payload: { sub: string; email: string; role: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
      include: {
        user: true,
        vendor: true,
        admin: true,
      },
    });

    if (!account) {
      throw new UnauthorizedException('User not found');
    }

    let profile: Record<string, unknown> | null = null;
    if (account.role === Role.USER && account.user) {
      const { accountId, ...rest } = account.user;
      profile = rest;
    } else if (account.role === Role.VENDOR && account.vendor) {
      const { accountId, ...rest } = account.vendor;
      profile = rest;
    } else if (account.role === Role.ADMIN && account.admin) {
      const { accountId, ...rest } = account.admin;
      profile = rest;
    }

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      profile,
    };
  }
}
