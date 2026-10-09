import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JWK } from 'jose';
import { Prisma } from '@prisma/client';
import {
  BizErr,
  CurrentUser,
  DpopExempt,
  JwtAuthGuard,
  JwtPayload,
  PrismaService,
} from '@telink/core';

@Controller('auth/dpop')
@UseGuards(JwtAuthGuard)
export class DpopController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  @DpopExempt()
  @HttpCode(200)
  async register(
    @CurrentUser() user: JwtPayload,
    @Body() body: { publicKey: JWK; deviceName?: string },
  ) {
    if (!user.sessionId) throw BizErr.BadRequest('No session');

    const jwk = body?.publicKey;
    if (!jwk || typeof jwk !== 'object') {
      throw BizErr.BadRequest('publicKey required');
    }
    if (jwk.kty !== 'EC') {
      throw BizErr.BadRequest('Only EC keys are supported');
    }
    if ((jwk as { crv?: string }).crv !== 'P-256') {
      throw BizErr.BadRequest('Only P-256 curves are supported');
    }
    if ((jwk as { d?: string }).d) {
      throw BizErr.BadRequest('Private key must not be sent');
    }

    await this.prisma.session.update({
      where: { id: user.sessionId },
      data: {
        dpopPublicKeyJwk: jwk as unknown as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }

  @Get('status')
  @DpopExempt()
  async status(@CurrentUser() user: JwtPayload) {
    if (!user.sessionId) throw BizErr.BadRequest('No session');
    const session = await this.prisma.session.findUnique({
      where: { id: user.sessionId },
      select: { dpopPublicKeyJwk: true },
    });
    return {
      registered: !!session?.dpopPublicKeyJwk,
      enforced: process.env.DPOP_ENFORCED === 'true',
    };
  }

  @Delete()
  @DpopExempt()
  @HttpCode(200)
  async unregister(@CurrentUser() user: JwtPayload) {
    if (!user.sessionId) throw BizErr.BadRequest('No session');
    await this.prisma.session.update({
      where: { id: user.sessionId },
      data: { dpopPublicKeyJwk: Prisma.DbNull },
    });
    return { ok: true };
  }
}