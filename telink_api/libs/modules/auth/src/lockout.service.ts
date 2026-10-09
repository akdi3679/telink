import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@telink/core';
import {
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_WINDOW_SEC,
} from './auth.constants';

export interface LockStatus {
  locked: boolean;
  retryAfterSec?: number;
}

export interface FailureResult {
  locked: boolean;
  attempts: number;
}

@Injectable()
export class LockoutService {
  private readonly logger = new Logger(LockoutService.name);

  constructor(private readonly redis: RedisService) {}

  private keyFailed(id: string) {
    return `lockout:failed:${id.toLowerCase()}`;
  }
  private keyLocked(id: string) {
    return `lockout:locked:${id.toLowerCase()}`;
  }

  async isLocked(identifier: string): Promise<LockStatus> {
    try {
      const ttl = await this.redis.client.ttl(this.keyLocked(identifier));
      if (ttl > 0) return { locked: true, retryAfterSec: ttl };
      return { locked: false };
    } catch (e) {
      this.logger.warn(`lockout.isLocked failed open: ${(e as Error).message}`);
      return { locked: false };
    }
  }

  async recordFailure(identifier: string): Promise<FailureResult> {
    try {
      const keyF = this.keyFailed(identifier);
      const keyL = this.keyLocked(identifier);

      const attempts = await this.redis.client.incr(keyF);
      if (attempts === 1) {
        await this.redis.client.expire(keyF, LOCKOUT_WINDOW_SEC);
      }

      if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
                await this.redis.client.set(
          keyL,
          '1',
          'EX',
          Number(process.env.LOCKOUT_DURATION_SEC ?? 15 * 60),
        );
        await this.redis.client.del(keyF);
        this.logger.warn(`Locked account: ${identifier} (attempts=${attempts})`);
        return { locked: true, attempts };
      }
      return { locked: false, attempts };
    } catch (e) {
      this.logger.warn(
        `lockout.recordFailure failed open: ${(e as Error).message}`,
      );
      return { locked: false, attempts: 0 };
    }
  }

  async recordSuccess(identifier: string): Promise<void> {
    try {
      await this.redis.client.del(this.keyFailed(identifier));
      await this.redis.client.del(this.keyLocked(identifier));
    } catch (e) {
      this.logger.warn(
        `lockout.recordSuccess failed open: ${(e as Error).message}`,
      );
    }
  }
}