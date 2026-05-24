import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { AuthService } from './auth.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const baseAccount = {
  id: 'account-id',
  email: 'user@example.com',
  passwordHash: '',
  role: Role.USER,
  isActive: true,
  emailVerified: true,
  emailVerificationTokenHash: null,
  emailVerificationTokenExpiresAt: null,
  user: { accountId: 'account-id', firstName: 'Jane', lastName: 'Doe' },
  vendor: null,
  admin: null,
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

describe('AuthService email verification', () => {
  let service: AuthService;
  let prisma: {
    account: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let sendMail: jest.Mock;

  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASS = 'smtp-pass';
    process.env.MAIL_FROM = 'CarMesh <no-reply@example.com>';
    process.env.EMAIL_VERIFICATION_BASE_URL =
      'http://localhost:5173/verify-email';
    process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_HOURS = '24';

    sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);

    prisma = {
      account: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('access-token'),
      verify: jest.fn(),
    };

    service = new AuthService(
      prisma as never,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('signup creates an unverified account and emails a verification link', async () => {
    prisma.account.findUnique.mockResolvedValue(null);
    prisma.account.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...baseAccount,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        emailVerified: data.emailVerified,
        emailVerificationTokenHash: data.emailVerificationTokenHash,
        emailVerificationTokenExpiresAt:
          data.emailVerificationTokenExpiresAt,
        user: {
          accountId: 'account-id',
          ...data.user.create,
        },
      }),
    );

    const result = await service.signupUser(
      ' User@Example.com ',
      'password123',
      'Jane',
      'Doe',
    );

    expect(result).toEqual({
      message:
        'Account created. Please check your email to verify your account.',
    });

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'user@example.com',
          role: Role.USER,
          emailVerified: false,
          emailVerificationTokenHash: expect.any(String),
          emailVerificationTokenExpiresAt: expect.any(Date),
        }),
      }),
    );

    const storedTokenHash =
      prisma.account.create.mock.calls[0][0].data.emailVerificationTokenHash;
    expect(storedTokenHash).toHaveLength(64);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Verify your CarMesh email',
        text: expect.stringContaining(
          'http://localhost:5173/verify-email?token=',
        ),
      }),
    );
    expect(sendMail.mock.calls[0][0].text).not.toContain(storedTokenHash);
  });

  it('valid token verifies email and clears the stored token', async () => {
    const token = 'valid-token';
    const expiresAt = new Date(Date.now() + 60_000);
    prisma.account.findUnique.mockResolvedValue({
      ...baseAccount,
      emailVerified: false,
      emailVerificationTokenHash: hashToken(token),
      emailVerificationTokenExpiresAt: expiresAt,
    });
    prisma.account.update.mockResolvedValue({
      ...baseAccount,
      emailVerified: true,
    });

    const result = await service.verifyEmail(token);

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { emailVerificationTokenHash: hashToken(token) },
    });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: baseAccount.id },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });
    expect(result).toEqual({
      message: 'Email verified successfully. You can now log in.',
    });
  });

  it('invalid token is rejected', async () => {
    prisma.account.findUnique.mockResolvedValue(null);

    await expect(service.verifyEmail('bad-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('expired token is rejected and cleared', async () => {
    const token = 'expired-token';
    prisma.account.findUnique.mockResolvedValue({
      ...baseAccount,
      emailVerified: false,
      emailVerificationTokenHash: hashToken(token),
      emailVerificationTokenExpiresAt: new Date(Date.now() - 60_000),
    });

    await expect(service.verifyEmail(token)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: baseAccount.id },
      data: {
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });
  });

  it('unverified user cannot login', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    prisma.account.findUnique.mockResolvedValue({
      ...baseAccount,
      passwordHash,
      emailVerified: false,
    });

    await expect(
      service.login('user@example.com', 'password123'),
    ).rejects.toThrow('Please verify your email before logging in.');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('verified user can login', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    prisma.account.findUnique.mockResolvedValue({
      ...baseAccount,
      passwordHash,
      emailVerified: true,
    });
    prisma.refreshToken.create.mockResolvedValue(undefined);

    const result = await service.login('user@example.com', 'password123');

    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: expect.any(String),
      user: {
        id: baseAccount.id,
        email: baseAccount.email,
        role: Role.USER,
        emailVerified: true,
      },
    });
  });
});
