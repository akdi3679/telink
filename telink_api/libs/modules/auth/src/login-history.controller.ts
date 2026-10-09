import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  JwtAuthGuard,
  JwtPayload,
  PrismaService,
} from '@telink/core';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

@Controller('auth/login-history')
@UseGuards(JwtAuthGuard)
export class LoginHistoryController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recent login attempts for the current user.
   *
   * Returns events whose action starts with "auth.login." - this covers
   * succeeded, failed, new_device, and impossible_travel.
   */
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(
      Math.max(parseInt(limit ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const rows = await this.prisma.securityEvent.findMany({
      where: {
        userId: user.sub,
        action: { startsWith: 'auth.login.' },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        ip: true,
        userAgent: true,
        geoCity: true,
        geoCountry: true,
        details: true,
        createdAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      ip: r.ip,
      userAgent: r.userAgent,
      geoCity: r.geoCity,
      geoCountry: r.geoCountry,
      details: r.details,
      createdAt: r.createdAt,
    }));
  }
}