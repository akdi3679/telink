import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  PrismaService,
  EmailSender,
  EMAIL_SENDER,
  BizErr,
  TokenService,
  SecurityEventWriter,
  GeoService,
} from '@telink/core';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHmac, randomInt } from 'crypto';
import { LockoutService } from './lockout.service';
import {
  
  SIGNUP_CODE_TTL_MS,
  SIGNUP_TOKEN_TTL_S,
  SIGNUP_MAX_ATTEMPTS,
  SIGNUP_RATE_LIMIT_PER_EMAIL,
  SIGNUP_RATE_WINDOW_MS,
  IMPOSSIBLE_TRAVEL_KMH,
  IMPOSSIBLE_TRAVEL_MIN_KM,
} from './auth.constants';

interface SignupTokenPayload {
  sub: string;
  scope: 'signup';
  email: string;
  phone: string;
}

export interface LoginContext {
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  geoCity?: string | null;
  geoCountry?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
    private readonly events: SecurityEventWriter,
    private readonly lockout: LockoutService,
    private readonly geo: GeoService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  private get hmacSecret(): string {
    return (
      this.config.get<string>('JWT_SECRET') ??
      'dev-only-change-me-in-production'
    );
  }

  private hashCode(scope: string, value: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`${scope}:${value}`)
      .digest('hex');
  }

  private generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  // ── Signup ──────────────────────────────────────────────────
  async signupStart(phone: string, email: string) {
    const normalizedPhone = phone.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const [phoneTaken, emailTaken] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone: normalizedPhone } }),
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
    ]);
    if (phoneTaken) throw BizErr.Conflict('Phone already registered');
    if (emailTaken) throw BizErr.Conflict('Email already registered');

    const recent = await this.prisma.pendingSignup.count({
      where: {
        email: normalizedEmail,
        createdAt: { gt: new Date(Date.now() - SIGNUP_RATE_WINDOW_MS) },
      },
    });
    if (recent >= SIGNUP_RATE_LIMIT_PER_EMAIL) {
      throw BizErr.TooManyRequests('Too many signup attempts. Try again later.');
    }

    const code = this.generateCode();
    const codeHash = this.hashCode(normalizedEmail, code);
    const expiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MS);

    const pending = await this.prisma.pendingSignup.create({
      data: {
        phone: normalizedPhone,
        email: normalizedEmail,
        codeHash,
        expiresAt,
      },
    });

    await this.email.send(
      normalizedEmail,
      'Your Telink verification code',
      `Hi,\n\nYour Telink verification code is: ${code}\n\n` +
        `This code expires in 10 minutes.\n\n` +
        `If you did not request this, you can ignore this email.\n\n- Telink`,
    );

    return { signupId: pending.id };
  }

  async signupVerifyEmail(signupId: string, code: string) {
    const pending = await this.prisma.pendingSignup.findUnique({
      where: { id: signupId },
    });
    if (!pending) throw BizErr.NotFound('Signup');
    if (pending.verifiedAt) throw BizErr.BadRequest('Signup already verified');
    if (pending.expiresAt < new Date()) throw BizErr.BadRequest('Code expired');
    if (pending.attempts >= SIGNUP_MAX_ATTEMPTS) {
      throw BizErr.TooManyRequests('Too many attempts');
    }

    const actual = this.hashCode(pending.email, code);
    if (pending.codeHash !== actual) {
      await this.prisma.pendingSignup.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw BizErr.Unauthorized('Invalid code');
    }

    await this.prisma.pendingSignup.update({
      where: { id: pending.id },
      data: { verifiedAt: new Date() },
    });

    const signupToken = await this.jwt.signAsync(
      {
        sub: pending.id,
        scope: 'signup',
        email: pending.email,
        phone: pending.phone,
      } satisfies SignupTokenPayload,
      { expiresIn: SIGNUP_TOKEN_TTL_S },
    );

    return { signupToken };
  }

  async signupComplete(input: {
    signupToken: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    jobTitle: string;
  }) {
    let payload: SignupTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<SignupTokenPayload>(
        input.signupToken,
      );
    } catch {
      throw BizErr.Unauthorized('Invalid or expired signup token');
    }
    if (payload.scope !== 'signup') {
      throw BizErr.Unauthorized('Invalid signup token');
    }

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { id: payload.sub },
    });
    if (!pending || !pending.verifiedAt) {
      throw BizErr.BadRequest('Signup not verified');
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ phone: pending.phone }, { email: pending.email }] },
    });
    if (existing) throw BizErr.Conflict('Account already exists');

    const passwordHash = await argonHash(input.password);

    const user = await this.prisma.user.create({
      data: {
        phone: pending.phone,
        email: pending.email,
        emailVerified: true,
        passwordHash,
        profile: {
          create: {
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            role: input.role,
            jobTitle: input.jobTitle.trim(),
          },
        },
      },
      include: { profile: true },
    });

    await this.prisma.pendingSignup.delete({ where: { id: pending.id } });

    const tokens = await this.issueTokens(
      user.id,
      user.phone,
      user.role,
    );
    return {
      ...tokens,
      user: this.publicUser(user),
      profile: user.profile,
    };
  }

  // ── Login ───────────────────────────────────────────────────
  async login(identifier: string, password: string, ctx: LoginContext = {}) {
    const id = identifier.trim();
    const isEmail = id.includes('@');

    // Account lockout check (fails open on Redis errors).
    const lockStatus = await this.lockout.isLocked(id);
    if (lockStatus.locked) {
            throw BizErr.Locked(
        lockStatus.retryAfterSec ?? Number(process.env.LOCKOUT_DURATION_SEC ?? 15 * 60),
      );
    }

    const user = await this.prisma.user.findUnique({
      where: isEmail ? { email: id.toLowerCase() } : { phone: id },
      include: { profile: true },
    });

    const dummyHash =
      '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlkdW1teWR1bW15$0000000000000000000000000000000000000000000';
    const ok = user
      ? await argonVerify(user.passwordHash, password).catch(() => false)
      : await argonVerify(dummyHash, password).catch(() => false);

    if (!user || !ok) {
      const failResult = await this.lockout.recordFailure(id);
      await this.events.write({
        userId: user?.id ?? null,
        action: 'auth.login.failed',
        deviceId: ctx.deviceId ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        details: {
          identifierType: isEmail ? 'email' : 'phone',
          reason: 'bad_credentials',
          attempts: failResult.attempts,
        },
      });
            if (failResult.locked) {
        throw BizErr.Locked(Number(process.env.LOCKOUT_DURATION_SEC ?? 15 * 60));
      }
      throw BizErr.Unauthorized('Invalid credentials');
    }
    if (user.status !== 'active') {
      await this.events.write({
        userId: user.id,
        action: 'auth.login.failed',
        deviceId: ctx.deviceId ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        details: { reason: 'not_active' },
      });
      throw BizErr.Forbidden('Account is not active');
    }

    // Successful authentication resets the failure counter.
    await this.lockout.recordSuccess(id);

    // Enrich the login context with an IP-derived location. The x-geo-*
    // headers from the client are IGNORED: they are trivially spoofed.
    const geoLookup = this.geo.lookup(ctx.ip ?? null);
    ctx.geoCity = geoLookup.city;
    ctx.geoCountry = geoLookup.country;
    ctx.geoLat = geoLookup.lat;
    ctx.geoLng = geoLookup.lng;
// New-device detection. Prefers x-device-id (Phase 1.5d3). Falls back
    // to User-Agent only if the client did not send a device id.
    const deviceId = this.normalizeDeviceId(ctx.deviceId);
    let isNewDevice = false;
    let detectionMethod: 'device_id' | 'user_agent' | 'none' = 'none';
    if (deviceId) {
      const seen = await this.prisma.session.count({
        where: { userId: user.id, deviceId },
      });
      isNewDevice = seen === 0;
      detectionMethod = 'device_id';
    } else if (ctx.userAgent) {
      const seen = await this.prisma.session.count({
        where: { userId: user.id, userAgent: ctx.userAgent },
      });
      isNewDevice = seen === 0;
      detectionMethod = 'user_agent';
    }

    const tokens = await this.issueTokens(
      user.id,
      user.phone,
      user.role,
      ctx,
    );

    await this.events.write({
      userId: user.id,
      sessionId: tokens.sessionId,
      action: 'auth.login.succeeded',
      deviceId: deviceId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      geoCity: ctx.geoCity ?? null,
      geoCountry: ctx.geoCountry ?? null,
    });

    if (isNewDevice) {
      await this.events.write({
        userId: user.id,
        sessionId: tokens.sessionId,
        action: 'auth.login.new_device',
        deviceId: deviceId ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        details: { detectionMethod },
      });

      // Fire the alert email (async, best-effort — never blocks the login)
      this.sendNewDeviceAlert(user, ctx).catch((e) => {
        this.logger.error(
          `login alert email failed for ${user.email}: ${(e as Error).message}`,
        );
      });
    }

    // Impossible travel check (async, non-blocking)
    this.detectImpossibleTravel(user, tokens.sessionId, ctx).catch((e: unknown) => {
      this.logger.error(
        `impossible-travel check failed for ${user.email}: ${(e as Error).message}`,
      );
    });

    return {
      ...tokens,
      isNewDevice,
      user: this.publicUser(user),
      profile: user.profile,
    };
  }

  // ── Refresh ─────────────────────────────────────────────────
  async refresh(
    rawToken: string,
    ctx: { deviceId?: string | null; ip?: string | null; userAgent?: string | null },
  ) {
    const rotated = await this.tokens.rotate(rawToken, {
      deviceId: ctx.deviceId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: { profile: true },
    });
    if (!user) throw BizErr.NotFound('User');

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        phone: user.phone,
        role: user.role,
        scope: 'access',
        sessionId: rotated.sessionId,
      },
      { expiresIn: '15m' },
    );

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      user: this.publicUser(user),
      profile: user.profile,
    };
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw BizErr.NotFound('User');

    const ok = await argonVerify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw BizErr.Unauthorized('Current password is incorrect');

    const newHash = await argonHash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all other sessions
    await this.tokens.revokeAllForUser(userId, 'password_changed');

    await this.events.write({
      userId,
      action: 'auth.password.changed',
    });

    return { ok: true };
  }

  async deleteAccount(userId: string) {
    await this.events.write({
      userId,
      action: 'auth.account.deleted',
    });

    // Hard delete - cascades to all related rows via Prisma onDelete
    await this.prisma.user.delete({ where: { id: userId } });
  }
  // ── Me ──────────────────────────────────────────────────────
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw BizErr.NotFound('User');
    return { user: this.publicUser(user), profile: user.profile };
  }

  // ── Helpers ─────────────────────────────────────────────────
  private async issueTokens(
    userId: string,
    phone: string,
    role: string,
    ctx?: LoginContext,
  ) {
    const issued = await this.tokens.issueTokens({
      userId,
      deviceId: this.normalizeDeviceId(ctx?.deviceId),
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      geoCity: ctx?.geoCity ?? null,
      geoCountry: ctx?.geoCountry ?? null,
      geoLat: ctx?.geoLat ?? null,
      geoLng: ctx?.geoLng ?? null,
    });
    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        phone,
        role,
        scope: 'access',
        sessionId: issued.sessionId,
      },
      { expiresIn: '15m' },
    );
    return {
      accessToken,
      refreshToken: issued.refreshToken,
      sessionId: issued.sessionId,
    };
  }

  private async detectImpossibleTravel(
    user: { id: string; email: string | null; phone: string },
    currentSessionId: string,
    ctx: LoginContext,
  ): Promise<void> {
    const lat = ctx.geoLat;
    const lng = ctx.geoLng;
    if (lat == null || lng == null) return;

    const previous = await this.prisma.session.findFirst({
      where: {
        userId: user.id,
        id: { not: currentSessionId },
        revokedAt: null,
        geoLat: { not: null },
        geoLng: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        geoLat: true,
        geoLng: true,
        geoCity: true,
        geoCountry: true,
        createdAt: true,
      },
    });
    if (!previous || previous.geoLat == null || previous.geoLng == null) return;

    const distanceKm = this.haversineKm(
      Number(previous.geoLat),
      Number(previous.geoLng),
      lat,
      lng,
    );
    if (distanceKm < IMPOSSIBLE_TRAVEL_MIN_KM) return;

    const elapsedMs = Date.now() - previous.createdAt.getTime();
    const elapsedHours = Math.max(elapsedMs / (1000 * 60 * 60), 1 / 3600);
    const speedKmh = distanceKm / elapsedHours;

    if (speedKmh <= IMPOSSIBLE_TRAVEL_KMH) return;

    await this.events.write({
      userId: user.id,
      sessionId: currentSessionId,
      action: 'auth.login.impossible_travel',
      deviceId: ctx.deviceId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      geoCity: ctx.geoCity ?? null,
      geoCountry: ctx.geoCountry ?? null,
      details: {
        previousCity: previous.geoCity,
        previousCountry: previous.geoCountry,
        previousAt: previous.createdAt.toISOString(),
        currentCity: ctx.geoCity ?? null,
        currentCountry: ctx.geoCountry ?? null,
        distanceKm: Math.round(distanceKm),
        elapsedSeconds: Math.round(elapsedMs / 1000),
        speedKmh: Math.round(speedKmh),
      },
    });

    this.logger.warn(
      `IMPOSSIBLE TRAVEL for ${user.id}: ` +
        `${previous.geoCity ?? '?'} -> ${ctx.geoCity ?? '?'} ` +
        `(${Math.round(distanceKm)} km in ${Math.round(elapsedMs / 1000)}s, ` +
        `${Math.round(speedKmh)} km/h)`,
    );

    this.sendImpossibleTravelAlert(user, previous, ctx, {
      distanceKm: Math.round(distanceKm),
      elapsedSeconds: Math.round(elapsedMs / 1000),
      speedKmh: Math.round(speedKmh),
    }).catch((e: unknown) => {
      this.logger.error(
        `impossible-travel alert failed for ${user.email}: ${(e as Error).message}`,
      );
    });
  }

  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private async sendImpossibleTravelAlert(
    user: { id: string; email: string | null },
    previous: {
      geoCity: string | null;
      geoCountry: string | null;
      createdAt: Date;
    },
    ctx: LoginContext,
    metrics: { distanceKm: number; elapsedSeconds: number; speedKmh: number },
  ): Promise<void> {
    const to = user.email;
    if (!to) return;

    const when =
      new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const prevPlace =
      [previous.geoCity, previous.geoCountry].filter(Boolean).join(', ') ||
      'Unknown';
    const currPlace =
      [ctx.geoCity, ctx.geoCountry].filter(Boolean).join(', ') || 'Unknown';

    const body =
      `Hi,\n\n` +
      `We detected a sign-in that appears to be physically impossible.\n\n` +
      `    Previous sign-in: ${prevPlace} at ${previous.createdAt.toISOString()}\n` +
      `    New sign-in:      ${currPlace} at ${when}\n` +
      `    Distance:         ${metrics.distanceKm} km\n` +
      `    Time elapsed:     ${metrics.elapsedSeconds} seconds\n` +
      `    Implied speed:    ${metrics.speedKmh} km/h\n\n` +
      `For reference, a commercial jet cruises around 900 km/h. Your account\n` +
      `shows a speed far above that.\n\n` +
      `If this was you (for example you are on a VPN, or you flew somewhere),\n` +
      `you can ignore this email.\n\n` +
      `If this was NOT you, someone may have your password:\n` +
      `  1. Change your password immediately\n` +
      `  2. Go to Profile -> Security -> Active sessions and revoke anything\n` +
      `     you do not recognize\n\n` +
      `- Telink Security`;

    await this.email.send(
      to,
      'Unusual sign-in activity on your Telink account',
      body,
    );
  }
  /**
   * Public wrapper used by PasskeyController. Issues tokens for a user
   * that already authenticated via WebAuthn. The caller is responsible
   * for having verified the assertion.
   */
  async issueTokensForUser(
    userId: string,
    ctx: {
      deviceId?: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw BizErr.NotFound('User');
    if (user.status !== 'active') {
      throw BizErr.Forbidden('Account is not active');
    }
const tokens = await this.issueTokens(user.id, user.phone, user.role, ctx);

    await this.events.write({
      userId: user.id,
      sessionId: tokens.sessionId,
      action: 'auth.login.succeeded',
      deviceId: ctx.deviceId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      details: { method: 'passkey' },
    });

    return {
      ...tokens,
      user: this.publicUser(user),
      profile: user.profile,
    };
  }

  private async sendNewDeviceAlert(
    user: { id: string; email: string | null; phone: string },
    ctx: LoginContext,
  ): Promise<void> {
    const to = user.email;
    if (!to) return;

    const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const device = ctx.userAgent ?? 'Unknown device';
    const ip = ctx.ip ?? 'Unknown IP';
    const location =
      ctx.geoCity || ctx.geoCountry
        ? `${ctx.geoCity ?? ''} ${ctx.geoCountry ?? ''}`.trim()
        : 'Unknown location';

    const body =
      `Hi,\n\n` +
      `We noticed a new sign-in to your Telink account.\n\n` +
      `    Time:     ${when}\n` +
      `    Device:   ${device}\n` +
      `    IP:       ${ip}\n` +
      `    Location: ${location}\n\n` +
      `If this was you, you can safely ignore this email.\n\n` +
      `If this wasn't you, someone may have your password. Please:\n` +
      `  1. Sign in and change your password immediately\n` +
      `  2. Go to Profile -> Security -> Active sessions and revoke anything you don't recognize\n\n` +
      `- Telink Security`;

    await this.email.send(to, 'New sign-in to your Telink account', body);
  }

  private normalizeDeviceId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 128) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
    return trimmed;
  }

  private publicUser(u: {
    id: string;
    phone: string;
    email: string | null;
    emailVerified: boolean;
    role: string;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: u.id,
      phone: u.phone,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
    };
  }
}