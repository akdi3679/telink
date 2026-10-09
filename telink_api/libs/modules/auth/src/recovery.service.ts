import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BizErr,
  EmailSender,
  EMAIL_SENDER,
  PrismaService,
  RedisService,
  SecurityEventWriter,
  TokenService,
} from '@telink/core';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { randomInt } from 'crypto';
import { AuthService } from './auth.service';
import {
  RECOVERY_ALPHABET,
  RECOVERY_ATTEMPT_WINDOW_SEC,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
  RECOVERY_MAX_ATTEMPTS,
  RECOVERY_RESET_TOKEN_TTL_S,
} from './auth.constants';

interface ResetTokenPayload {
  sub: string;
  scope: 'password_reset';
  email: string;
}

export interface RecoveryContext {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly events: SecurityEventWriter,
    private readonly auth: AuthService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  private generateCode(): string {
    let out = '';
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
      out += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
    }
    return out;
  }

  private formatCodes(codes: string[]): string {
    return codes.map((c) => c.match(/.{1,4}/g)!.join('-')).join('\n');
  }

  private normalizeCode(raw: string): string {
    return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  private rateLimitKey(email: string): string {
    return `recovery:attempts:${email.toLowerCase()}`;
  }

  // ── Generation ────────────────────────────────────────────

  async generateCodes(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw BizErr.NotFound('User');

    // Wipe any existing codes for this user (regeneration invalidates old).
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });

    const codes: string[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      codes.push(this.generateCode());
    }

    // Hash each code with Argon2 and store.
    const rows = await Promise.all(
      codes.map(async (code) => ({
        userId,
        codeHash: await argonHash(code),
      })),
    );
    await this.prisma.recoveryCode.createMany({ data: rows });

    await this.events.write({
      userId,
      action: 'auth.recovery.codes_generated',
      details: { count: RECOVERY_CODE_COUNT },
    });

    if (user.email) {
      await this.email.send(
        user.email,
        'Your Telink recovery codes',
        `Hi,\n\nYou have generated new recovery codes for your Telink account.\n` +
          `Save them somewhere safe. Each code can be used once.\n\n` +
          `${this.formatCodes(codes)}\n\n` +
          `If you did not request this, change your password immediately.\n\n` +
          `- Telink Security`,
      );
    }

    // Returned ONLY once. Server stores hashes, never plaintext.
    return { codes };
  }

  async status(userId: string) {
    const total = await this.prisma.recoveryCode.count({
      where: { userId },
    });
    const used = await this.prisma.recoveryCode.count({
      where: { userId, usedAt: { not: null } },
    });
    const latest = await this.prisma.recoveryCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return {
      total,
      remaining: total - used,
      generatedAt: latest?.createdAt ?? null,
    };
  }

  // ── Reset flow ────────────────────────────────────────────

  /**
   * Step 1: verify email + recovery code. Returns a short-lived reset token.
   * The code is NOT consumed yet. Only the second step consumes it.
   */
  async verify(email: string, rawCode: string, ctx: RecoveryContext) {
    const normalized = email.trim().toLowerCase();

    // Rate limit by email.
    const rlKey = this.rateLimitKey(normalized);
    const attempts = await this.redis.client.incr(rlKey);
    if (attempts === 1) {
      await this.redis.client.expire(rlKey, RECOVERY_ATTEMPT_WINDOW_SEC);
    }
    if (attempts > RECOVERY_MAX_ATTEMPTS) {
      throw BizErr.TooManyRequests(
        'Too many recovery attempts. Try again later.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (!user) {
      // Do not leak user existence.
      throw BizErr.Unauthorized('Invalid email or recovery code');
    }

    const code = this.normalizeCode(rawCode);
    if (code.length !== RECOVERY_CODE_LENGTH) {
      throw BizErr.Unauthorized('Invalid email or recovery code');
    }

    // Fetch unused codes for this user and try each.
    const candidates = await this.prisma.recoveryCode.findMany({
      where: { userId: user.id, usedAt: null },
    });

    let matchId: string | null = null;
    for (const c of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await argonVerify(c.codeHash, code).catch(() => false);
      if (ok) {
        matchId = c.id;
        break;
      }
    }

    if (!matchId) {
      await this.events.write({
        userId: user.id,
        action: 'auth.recovery.failed',
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        details: { reason: 'code_mismatch' },
      });
      throw BizErr.Unauthorized('Invalid email or recovery code');
    }

    // Success — issue reset token. Code stays unused until complete().
    const resetToken = await this.jwt.signAsync(
      {
        sub: user.id,
        scope: 'password_reset',
        email: normalized,
      } satisfies ResetTokenPayload,
      { expiresIn: RECOVERY_RESET_TOKEN_TTL_S },
    );

    // Store the matched code id in Redis so complete() knows which one to burn.
    await this.redis.client.set(
      `recovery:reset:${user.id}`,
      matchId,
      'EX',
      RECOVERY_RESET_TOKEN_TTL_S,
    );

    return { resetToken };
  }

  /**
   * Step 2: set a new password using the reset token from verify().
   * Consumes the matched recovery code, revokes all sessions, returns
   * fresh tokens so the user is signed in immediately.
   */
  async complete(
    resetToken: string,
    newPassword: string,
    ctx: RecoveryContext,
  ) {
    let payload: ResetTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<ResetTokenPayload>(resetToken);
    } catch {
      throw BizErr.Unauthorized('Invalid or expired reset token');
    }
    if (payload.scope !== 'password_reset') {
      throw BizErr.Unauthorized('Invalid reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw BizErr.NotFound('User');

    const matchedCodeId = await this.redis.client.get(
      `recovery:reset:${user.id}`,
    );
    if (!matchedCodeId) {
      throw BizErr.Unauthorized('Reset session expired');
    }

    // Mark the code used. Guard against double-use.
    const burned = await this.prisma.recoveryCode.updateMany({
      where: { id: matchedCodeId, usedAt: null },
      data: { usedAt: new Date(), usedFromIp: ctx.ip ?? null },
    });
    if (burned.count === 0) {
      throw BizErr.Unauthorized('This recovery code has already been used');
    }

    // Set new password.
    const passwordHash = await argonHash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Burn all refresh tokens and sessions for this user.
    await this.tokens.revokeAllForUser(user.id, 'password_recovered');

    // Delete the reset marker.
    await this.redis.client.del(`recovery:reset:${user.id}`);

    // Clear rate limit for this email.
    await this.redis.client.del(this.rateLimitKey(user.email ?? ''));

    await this.events.write({
      userId: user.id,
      action: 'auth.recovery.completed',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    if (user.email) {
      await this.email.send(
        user.email,
        'Your Telink password was reset',
        `Hi,\n\nYour Telink password was reset using a recovery code.\n` +
          `All your other sessions have been signed out.\n\n` +
          `If this was not you, contact security@telink.app immediately.\n\n` +
          `- Telink Security`,
      );
    }

    // Issue fresh tokens so the user is signed in with a clean slate.
    const issued = await this.auth.issueTokensForUser(user.id, {
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return issued;
  }
}