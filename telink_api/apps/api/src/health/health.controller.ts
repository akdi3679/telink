import { Controller, Get } from '@nestjs/common';
import { PrismaService, RedisService } from '@telink/core';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }

  @Get('ready')
  async readiness() {
    const checks: Record<
      string,
      { ok: boolean; latencyMs?: number; error?: string }
    > = {};

    await this.check(
      'postgres',
      () => this.prisma.$queryRaw`SELECT 1`.then(() => undefined),
      checks,
    );
    await this.check(
      'redis',
      () => this.redis.client.ping().then(() => undefined),
      checks,
    );

    const allOk = Object.values(checks).every((c) => c.ok);
    return { status: allOk ? 'ready' : 'degraded', checks };
  }

  @Get('version')
  version() {
    return {
      version: process.env.APP_VERSION ?? 'dev',
      commit: process.env.GIT_COMMIT ?? 'unknown',
      buildAt: process.env.BUILD_AT ?? new Date().toISOString(),
      node: process.version,
    };
  }

  private async check(
    name: string,
    fn: () => Promise<unknown>,
    out: Record<string, { ok: boolean; latencyMs?: number; error?: string }>,
  ) {
    const start = Date.now();
    try {
      await fn();
      out[name] = { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      out[name] = {
        ok: false,
        error: (e as Error).message,
        latencyMs: Date.now() - start,
      };
    }
  }
}