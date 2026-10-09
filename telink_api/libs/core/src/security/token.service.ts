import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { SecurityEventWriter } from './security-event-writer.service';

export interface IssueContext {
  userId: string;
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  geoCity?: string | null;
  geoCountry?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  sessionId: string;
}

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: SecurityEventWriter,
  ) {}

  private get secret(): string {
    return (
      this.config.get<string>('JWT_SECRET') ??
      'dev-only-change-me-in-production'
    );
  }

  private generateOpaque(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueTokens(
    ctx: IssueContext,
    sessionId?: string,
  ): Promise<IssuedTokens> {
    const accessToken = this.generateOpaque();
    const refreshToken = this.generateOpaque();
    const now = Date.now();
    const accessExpiresAt = new Date(now + ACCESS_TTL_SECONDS * 1000);
    const refreshExpiresAt = new Date(now + REFRESH_TTL_SECONDS * 1000);

    let sid = sessionId;
    if (!sid) {
      const session = await this.prisma.session.create({
        data: {
          userId: ctx.userId,
          deviceId: ctx.deviceId ?? null,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          geoCity: ctx.geoCity ?? null,
          geoCountry: ctx.geoCountry ?? null,
          geoLat: ctx.geoLat ?? null,
          geoLng: ctx.geoLng ?? null,
          expiresAt: refreshExpiresAt,
        },
      });
      sid = session.id;
    } else {
      await this.prisma.session.update({
        where: { id: sid },
        data: { lastSeenAt: new Date() },
      });
    }

    await this.prisma.refreshToken.create({
      data: {
        sessionId: sid,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      sessionId: sid,
    };
  }

  async rotate(
    incomingToken: string,
    ctx: Omit<IssueContext, 'userId'>,
  ): Promise<IssuedTokens & { userId: string }> {
    const tokenHash = this.hashToken(incomingToken);

    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; session_id: string; user_id: string }>
    >`
      UPDATE refresh_tokens rt
      SET used_at = now()
      FROM sessions s
      WHERE rt.session_id = s.id
        AND rt.token_hash = ${tokenHash}
        AND rt.used_at IS NULL
        AND rt.expires_at > now()
        AND s.revoked_at IS NULL
      RETURNING rt.id, rt.session_id, s.user_id
    `;

    if (rows.length === 1) {
      const { id: oldTokenId, session_id, user_id } = rows[0];

      const next = await this.issueTokens(
        { userId: user_id, ...ctx },
        session_id,
      );

      const newToken = await this.prisma.refreshToken.findFirst({
        where: { sessionId: session_id, usedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (newToken) {
        await this.prisma.refreshToken.update({
          where: { id: oldTokenId },
          data: { replacedById: newToken.id },
        });
      }

      await this.events.write({
        userId: user_id,
        sessionId: session_id,
        action: 'auth.token.rotated',
        ...ctx,
      });

      return { ...next, userId: user_id };
    }

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: true },
    });

    if (!existing) {
      await this.events.write({
        userId: null,
        sessionId: null,
        action: 'auth.token.invalid_presented',
        details: { reason: 'not_found' },
        ...ctx,
      });
      throw new Error('invalid_token');
    }

    if (existing.session.revokedAt) {
      throw new Error('session_revoked');
    }

    if (existing.usedAt) {
      await this.prisma.session.update({
        where: { id: existing.sessionId },
        data: { revokedAt: new Date(), revokedReason: 'replay_detected' },
      });
      await this.prisma.refreshToken.updateMany({
        where: { sessionId: existing.sessionId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await this.events.write({
        userId: existing.session.userId,
        sessionId: existing.sessionId,
        action: 'auth.token.replay_detected',
        details: { originalUsedAt: existing.usedAt.toISOString() },
        ...ctx,
      });

      this.logger.error(
        `REPLAY: session ${existing.sessionId} revoked. Token replayed.`,
      );
      throw new Error('replay_detected');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new Error('token_expired');
    }

    throw new Error('invalid_token');
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.prisma.refreshToken.updateMany({
      where: { sessionId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    for (const s of sessions) {
      await this.revokeSession(s.id, reason);
    }
  }

  async listForUser(
    userId: string,
    currentSessionId: string | null,
  ): Promise<Array<{
    id: string;
    deviceId: string | null;
    ip: string | null;
    userAgent: string | null;
    geoCity: string | null;
    geoCountry: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    isCurrent: boolean;
  }>> {
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        ip: true,
        userAgent: true,
        geoCity: true,
        geoCountry: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });

    return rows.map((r) => ({
      ...r,
      isCurrent: currentSessionId !== null && r.id === currentSessionId,
    }));
  }

  async revokeForUser(
    userId: string,
    sessionId: string,
    reason: string,
  ): Promise<{ ok: true }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new Error('session_not_found');
    }
    if (session.revokedAt) {
      return { ok: true };
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.prisma.refreshToken.updateMany({
      where: { sessionId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.events.write({
      userId,
      sessionId,
      action: 'auth.session.revoked',
      details: { reason },
    });

    return { ok: true };
  }

  async revokeAllExcept(
    userId: string,
    keepSessionId: string | null,
    reason: string,
  ): Promise<{ revoked: number }> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      select: { id: true },
    });

    for (const s of sessions) {
      await this.revokeForUser(userId, s.id, reason);
    }

    return { revoked: sessions.length };
  }
}