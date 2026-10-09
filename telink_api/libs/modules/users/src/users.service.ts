import { Injectable } from '@nestjs/common';
import { PrismaService, BizErr } from '@telink/core';
import { UpdateProfileDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw BizErr.NotFound('User');
    return { user: this.publicUser(user), profile: user.profile };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!existing) throw BizErr.NotFound('Profile');

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) data[k] = v;
    }

    const profile = await this.prisma.profile.update({
      where: { userId },
      data,
    });
    return { profile };
  }

  async getPublic(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw BizErr.NotFound('User');
    return {
      user: this.publicUser(user),
      profile: user.profile,
    };
  }

  private publicUser(u: {
    id: string;
    phone: string;
    email: string;
    emailVerified: boolean;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: u.id,
      phone: u.phone,
      email: u.email,
      emailVerified: u.emailVerified,
      status: u.status,
      createdAt: u.createdAt,
    };
  }
}