import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import {
  PrismaService,
  EMAIL_SENDER,
  TokenService,
  SecurityEventWriter,
  GeoService,
} from '@telink/core';
import { LockoutService } from './lockout.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock };
  let email: { send: jest.Mock };
  let tokens: { issueTokens: jest.Mock; rotate: jest.Mock };
  let events: { write: jest.Mock };
  let geo: { lookup: jest.Mock };
  let lockout: {
    isLocked: jest.Mock;
    recordFailure: jest.Mock;
    recordSuccess: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      pendingSignup: {
        count: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      session: { create: jest.fn() },
    };

    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        return undefined;
      }),
    };

    email = { send: jest.fn().mockResolvedValue(undefined) };

    tokens = {
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        accessExpiresAt: new Date(),
        refreshExpiresAt: new Date(),
        sessionId: 'session-1',
      }),
      rotate: jest.fn(),
    };

    events = { write: jest.fn().mockResolvedValue(undefined) };

    geo = {
      lookup: jest.fn().mockReturnValue({
        city: null,
        country: null,
        countryCode: null,
        lat: null,
        lng: null,
      }),
    };

    lockout = {
      isLocked: jest.fn().mockResolvedValue({ locked: false }),
      recordFailure: jest.fn().mockResolvedValue({ locked: false, attempts: 1 }),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: EMAIL_SENDER, useValue: email },
        { provide: TokenService, useValue: tokens },
        { provide: SecurityEventWriter, useValue: events },
        { provide: GeoService, useValue: geo },
        { provide: GeoService, useValue: geo },
        { provide: LockoutService, useValue: lockout },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('signupStart', () => {
    it('creates a pending signup and sends an email code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.pendingSignup.count.mockResolvedValue(0);
      prisma.pendingSignup.create.mockResolvedValue({ id: 'p-1' });

      const result = await service.signupStart('+21612345678', 'a@b.com');

      expect(result).toEqual({ signupId: 'p-1' });
      expect(email.send).toHaveBeenCalledTimes(1);
      const [to, subject, body] = email.send.mock.calls[0];
      expect(to).toBe('a@b.com');
      expect(subject).toMatch(/verification code/i);
      expect(body).toMatch(/\d{6}/);
    });

    it('rejects when phone is already registered', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u-1' })
        .mockResolvedValueOnce(null);
      await expect(
        service.signupStart('+21612345678', 'a@b.com'),
      ).rejects.toThrow(/Phone already registered/);
    });

    it('rejects when email is already registered', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'u-2' });
      await expect(
        service.signupStart('+21612345678', 'a@b.com'),
      ).rejects.toThrow(/Email already registered/);
    });

    it('rate-limits after 3 recent attempts', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.pendingSignup.count.mockResolvedValue(3);
      await expect(
        service.signupStart('+21612345678', 'a@b.com'),
      ).rejects.toThrow(/Too many signup attempts/);
    });
  });

  describe('signupVerifyEmail', () => {
    it('accepts the right code and returns a signup token', async () => {
      const code = '123456';
      const codeHash = (service as any).hashCode('a@b.com', code);
      prisma.pendingSignup.findUnique.mockResolvedValue({
        id: 'p-1',
        email: 'a@b.com',
        phone: '+21612345678',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        verifiedAt: null,
      });
      prisma.pendingSignup.update.mockResolvedValue({});

      const result = await service.signupVerifyEmail('p-1', code);
      expect(result.signupToken).toBe('signed-token');
      expect(jwt.signAsync).toHaveBeenCalled();
    });

    it('rejects wrong code', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue({
        id: 'p-1',
        email: 'a@b.com',
        codeHash: 'deadbeef',
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        verifiedAt: null,
      });
      prisma.pendingSignup.update.mockResolvedValue({});
      await expect(
        service.signupVerifyEmail('p-1', '000000'),
      ).rejects.toThrow(/Invalid code/);
    });

    it('rejects expired signup', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue({
        id: 'p-1',
        email: 'a@b.com',
        codeHash: 'x',
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
        verifiedAt: null,
      });
      await expect(
        service.signupVerifyEmail('p-1', '000000'),
      ).rejects.toThrow(/expired/);
    });
  });

  describe('signupComplete', () => {
    it('rejects a token with scope != signup', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'p-1',
        scope: 'access',
        email: 'a@b.com',
        phone: '+216',
      });
      await expect(
        service.signupComplete({
          signupToken: 'x',
          password: 'abc12345',
          firstName: 'A',
          lastName: 'B',
          role: 'student',
          jobTitle: 'Dev',
        }),
      ).rejects.toThrow(/Invalid signup token/);
    });

    it('rejects an invalid/expired token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      await expect(
        service.signupComplete({
          signupToken: 'x',
          password: 'abc12345',
          firstName: 'A',
          lastName: 'B',
          role: 'student',
          jobTitle: 'Dev',
        }),
      ).rejects.toThrow(/Invalid or expired/);
    });
  });

  describe('login', () => {
    it('rejects unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login('nobody@x.com', 'password1'),
      ).rejects.toThrow(/Invalid credentials/);
    });

    it('rejects locked account', async () => {
      lockout.isLocked.mockResolvedValue({ locked: true, retryAfterSec: 600 });
      await expect(
        service.login('any@x.com', 'password1'),
      ).rejects.toThrow(/locked/);
    });
  });
});