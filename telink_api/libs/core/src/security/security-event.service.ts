import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../database/prisma.service';

export interface ListFilters {
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: string;
}

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return (
      this.config.get<string>('JWT_SECRET') ??
      'dev-only-change-me-in-production'
    );
  }

  private recomputeSignature(event: {
    userId: string | null;
    sessionId: string | null;
    action: string;
    deviceId: string | null;
    ip: string | null;
    userAgent: string | null;
    details: unknown;
    createdAt: Date;
  }): string {
    const detailsJson = JSON.stringify(event.details ?? {});
    return createHmac('sha256', this.secret)
      .update(
        [
          event.userId,
          event.sessionId,
          event.action,
          event.deviceId,
          event.ip,
          event.userAgent,
          detailsJson,
          event.createdAt.toISOString(),
        ]
          .map((p) => p ?? '')
          .join('|'),
      )
      .digest('hex');
  }

  async list(filters: ListFilters) {
    const where: Record<string, unknown> = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.gte = filters.from;
      if (filters.to) range.lte = filters.to;
      where.createdAt = range;
    }

    const limit = Math.min(Math.max(filters.limit, 1), 200);
    const items = await this.prisma.securityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filters.cursor
        ? { cursor: { id: filters.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;

    return { items: trimmed, nextCursor, hasMore };
  }

  async verifySignature(eventId: string) {
    const event = await this.prisma.securityEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) return { valid: false, reason: 'not_found' };

    const expected = this.recomputeSignature({
      userId: event.userId,
      sessionId: event.sessionId,
      action: event.action,
      deviceId: event.deviceId,
      ip: event.ip,
      userAgent: event.userAgent,
      details: event.details,
      createdAt: event.createdAt,
    });

    return {
      valid: expected === event.signature,
      eventId,
      stored: event.signature,
      computed: expected,
    };
  }

  async pruneOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.securityEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(`Pruned ${result.count} security events older than ${days} days`);
    return result.count;
  }
}