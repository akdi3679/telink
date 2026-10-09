import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { JWK } from 'jose';
import { PrismaService } from '../database/prisma.service';
import { DpopService } from './dpop.service';
import { DPOP_EXEMPT_KEY } from './dpop.decorator';

export interface JwtPayload {
  sub: string;
  phone?: string;
  role?: string;
  sessionId?: string;
  scope?: 'access' | 'refresh' | 'signup';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly dpop: DpopService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = auth.slice('Bearer '.length).trim();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (payload.scope && payload.scope !== 'access') {
        throw new UnauthorizedException('Wrong token type');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.user = payload;

    // Routes marked @DpopExempt() skip DPoP entirely.
    const exempt = this.reflector.getAllAndOverride<boolean>(DPOP_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) return true;

    // Enforcement is off unless DPOP_ENFORCED=true in the environment.
    const enforced = process.env.DPOP_ENFORCED === 'true';
    const proof = (req.headers['dpop'] as string | undefined) ?? undefined;

    if (!proof) {
      if (!enforced) return true;
      throw new UnauthorizedException('DPoP proof required');
    }

    if (!payload.sessionId) {
      if (!enforced) return true;
      throw new UnauthorizedException('DPoP requires a session');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Session not found or revoked');
    }

    const expectedJwk = session.dpopPublicKeyJwk as JWK | null;
    if (!expectedJwk) {
      if (!enforced) return true;
      throw new UnauthorizedException('DPoP key not registered for this session');
    }

    const fullUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
    try {
      await this.dpop.verify({
        proofJwt: proof,
        method: req.method,
        url: fullUrl,
        accessToken: token,
        expectedJwk,
      });
    } catch (e) {
      throw new UnauthorizedException(
        `DPoP verification failed: ${(e as Error).message}`,
      );
    }

    return true;
  }
}