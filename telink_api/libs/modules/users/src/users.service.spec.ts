import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '@telink/core';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      profile: { findUnique: jest.fn(), update: jest.fn() },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('getMe', () => {
    it('returns user + profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        phone: '+216',
        email: 'a@b.com',
        emailVerified: true,
        status: 'active',
        createdAt: new Date(),
        profile: { firstName: 'A' },
      });
      const res: any = await service.getMe('u-1');
      expect(res.user.id).toBe('u-1');
      expect(res.profile?.firstName).toBe('A');
    });

    it('throws if user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('nope')).rejects.toThrow(/not found/i);
    });
  });

  describe('updateMe', () => {
    it('updates provided fields only', async () => {
      prisma.profile.findUnique.mockResolvedValue({ userId: 'u-1' });
      prisma.profile.update.mockResolvedValue({
        userId: 'u-1',
        headline: 'New',
      });
      const res: any = await service.updateMe('u-1', { headline: 'New' });
      expect(res.profile?.headline).toBe('New');
      const arg = prisma.profile.update.mock.calls[0][0];
      expect(arg.data).toEqual({ headline: 'New' });
    });

    it('throws if profile missing', async () => {
      prisma.profile.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMe('nope', { headline: 'X' }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('getPublic', () => {
    it('returns public view', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        phone: '+216',
        email: 'a@b.com',
        emailVerified: true,
        status: 'active',
        createdAt: new Date(),
        profile: { firstName: 'A', bio: 'hi' },
      });
      const res: any = await service.getPublic('u-1');
      expect(res.user.email).toBe('a@b.com');
      expect(res.profile?.bio).toBe('hi');
    });
  });
});