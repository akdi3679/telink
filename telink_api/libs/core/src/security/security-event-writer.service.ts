import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../database/prisma.service';

export interface SecurityEventInput {
  userId: string | null;
  sessionId?: string | null;
  action: string;
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  geoCity?: string | null;
  geoCountry?: string | null;
  details?: Record<string, unknown>;
}

@Injectable()
export class SecurityEventWriter {
  private readonly logger = new Logger(SecurityEventWriter.name);

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

  async write(input: SecurityEventInput): Promise<void> {
    const createdAt = new Date();
    const detailsJson = JSON.stringify(input.details ?? {});
    const signature = createHmac('sha256', this.secret)
      .update(
        [
          input.userId,
          input.sessionId,
          input.action,
          input.deviceId,
          input.ip,
          input.userAgent,
          detailsJson,
          createdAt.toISOString(),
        ]
          .map((p) => p ?? '')
          .join('|'),
      )
      .digest('hex');

    try {
      await this.prisma.securityEvent.create({
        data: {
          userId: input.userId,
          sessionId: input.sessionId ?? null,
          action: input.action,
          deviceId: input.deviceId ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          geoCity: input.geoCity ?? null,
          geoCountry: input.geoCountry ?? null,
          details: (input.details ?? {}) as object,
          signature,
          createdAt,
        },
      });
    } catch (e) {
      this.logger.error(`security event write failed: ${(e as Error).message}`);
    }
  }
}