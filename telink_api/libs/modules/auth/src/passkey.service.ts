import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, BizErr, RedisService } from '@telink/core';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import { randomBytes } from 'crypto';
import { PASSKEY_CHALLENGE_TTL_SEC } from './auth.constants';

interface PasskeyConfig {
  rpId: string;
  rpName: string;
  origin: string;
}

@Injectable()
export class PasskeyService {
  private readonly logger = new Logger(PasskeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get cfg(): PasskeyConfig {
    return {
      rpId: this.config.get<string>('WEBAUTHN_RP_ID') ?? 'localhost',
      rpName: this.config.get<string>('WEBAUTHN_RP_NAME') ?? 'Telink',
      origin:
        this.config.get<string>('WEBAUTHN_ORIGIN') ?? 'http://localhost:8080',
    };
  }

  async beginRegistration(userId: string, deviceName?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw BizErr.NotFound('User');

    const existing = await this.prisma.passkeyCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const displayName =
      user.profile?.firstName && user.profile?.lastName
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user.email ?? user.phone;

    const options = await generateRegistrationOptions({
      rpName: this.cfg.rpName,
      rpID: this.cfg.rpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.email ?? user.phone,
      userDisplayName: displayName,
      timeout: 60000,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.redis.client.set(
      `passkey:register:${userId}`,
      options.challenge,
      'EX',
      PASSKEY_CHALLENGE_TTL_SEC,
    );
    if (deviceName) {
      await this.redis.client.set(
        `passkey:register:name:${userId}`,
        deviceName,
        'EX',
        PASSKEY_CHALLENGE_TTL_SEC,
      );
    }

    return options;
  }

  async finishRegistration(
    userId: string,
    response: RegistrationResponseJSON,
  ) {
    const challenge = await this.redis.client.get(`passkey:register:${userId}`);
    if (!challenge) throw BizErr.BadRequest('Registration challenge expired');

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.cfg.origin,
        expectedRPID: this.cfg.rpId,
        requireUserVerification: false,
      });
    } catch (e) {
      this.logger.warn(
        `Registration verification failed: ${(e as Error).message}`,
      );
      throw BizErr.BadRequest('Invalid registration response');
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw BizErr.BadRequest('Registration not verified');
    }

    const { credential, aaguid } = verification.registrationInfo;

    const deviceName =
      (await this.redis.client.get(`passkey:register:name:${userId}`)) ?? null;

    await this.prisma.passkeyCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        name: deviceName,
        aaguid: aaguid || null,
      },
    });

    await this.redis.client.del(`passkey:register:${userId}`);
    await this.redis.client.del(`passkey:register:name:${userId}`);

    return { ok: true };
  }

  async beginAuthentication(identifier?: string) {
    let allowCredentials: {
      id: string;
      transports: AuthenticatorTransportFuture[];
    }[] = [];

    if (identifier) {
      const user = await this.prisma.user.findFirst({
        where: identifier.includes('@')
          ? { email: identifier.trim().toLowerCase() }
          : { phone: identifier.trim() },
        include: { passkeys: true },
      });
      if (user && user.passkeys.length > 0) {
        allowCredentials = user.passkeys.map((p) => ({
          id: p.credentialId,
          transports: p.transports as AuthenticatorTransportFuture[],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.cfg.rpId,
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials,
    });

    const sessionId = randomBytes(24).toString('base64url');
    await this.redis.client.set(
      `passkey:auth:${sessionId}`,
      JSON.stringify({ challenge: options.challenge }),
      'EX',
      PASSKEY_CHALLENGE_TTL_SEC,
    );

    return { options, sessionId };
  }

  async finishAuthentication(
    sessionId: string,
    response: AuthenticationResponseJSON,
    ctx: {
      deviceId?: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
  ) {
    const raw = await this.redis.client.get(`passkey:auth:${sessionId}`);
    if (!raw) throw BizErr.BadRequest('Authentication challenge expired');
    const stored = JSON.parse(raw) as { challenge: string };

    const credentialRecord = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
      include: { user: { include: { profile: true } } },
    });
    if (!credentialRecord) {
      throw BizErr.Unauthorized('Unknown passkey');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.cfg.origin,
        expectedRPID: this.cfg.rpId,
        requireUserVerification: false,
        credential: {
          id: credentialRecord.credentialId,
          publicKey: new Uint8Array(credentialRecord.publicKey),
          counter: Number(credentialRecord.counter),
          transports: credentialRecord.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch (e) {
      this.logger.warn(
        `Authentication verification failed: ${(e as Error).message}`,
      );
      throw BizErr.Unauthorized('Invalid passkey response');
    }

    if (!verification.verified) {
      throw BizErr.Unauthorized('Passkey not verified');
    }

    await this.prisma.passkeyCredential.update({
      where: { id: credentialRecord.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    await this.redis.client.del(`passkey:auth:${sessionId}`);

    return {
      userId: credentialRecord.userId,
      user: credentialRecord.user,
      deviceId: ctx.deviceId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    };
  }

  async listForUser(userId: string) {
    return this.prisma.passkeyCredential.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        aaguid: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteForUser(userId: string, id: string) {
    const cred = await this.prisma.passkeyCredential.findUnique({
      where: { id },
    });
    if (!cred || cred.userId !== userId) {
      throw BizErr.NotFound('Passkey');
    }
    await this.prisma.passkeyCredential.delete({ where: { id } });
    return { ok: true };
  }
}