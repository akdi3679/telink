/**
 * DpopService - verifies DPoP proof JWTs (RFC 9449).
 *
 * A DPoP proof is a JWT signed with an ECDSA P-256 private key. Its header
 * carries the matching public JWK. The server verifies the signature, checks
 * that the request method and URL match, binds the proof to the bearer token
 * via an "ath" claim, and uses jti + Redis to prevent replay.
 *
 * We intentionally do NOT implement proof-of-possession for the entire OAuth
 * flow (that would require modifying oidc-provider). We only add a per-request
 * signature check on top of the existing bearer token auth. This gives the
 * same protection against token theft: a stolen bearer token cannot be used
 * without the matching DPoP private key.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose';
import { RedisService } from '../redis/redis.service';

export interface DpopVerifyInput {
  proofJwt: string;
  method: string;
  url: string;
  accessToken: string;
  expectedJwk: JWK;
}

export interface DpopVerifyResult {
  jti: string;
  jwk: JWK;
}

const MAX_AGE_SEC = 60;
const JTI_TTL_SEC = 120;

@Injectable()
export class DpopService {
  private readonly logger = new Logger(DpopService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async verify(input: DpopVerifyInput): Promise<DpopVerifyResult> {
    // 1. Header must declare typ=dpop+jwt, alg=ES256, and embed a public JWK.
    let header;
    try {
      header = decodeProtectedHeader(input.proofJwt);
    } catch {
      throw new Error('dpop_invalid_jwt_format');
    }
    if (header.typ !== 'dpop+jwt') throw new Error('dpop_invalid_typ');
    if (header.alg !== 'ES256') throw new Error('dpop_invalid_alg');
    if (!header.jwk) throw new Error('dpop_missing_jwk');

    const jwk = header.jwk as JWK;
    if (jwk.kty !== 'EC') throw new Error('dpop_invalid_kty');
    if ((jwk as { d?: string }).d) throw new Error('dpop_private_key_leaked');

    // 2. Verify the signature using the JWK embedded in the header.
    const publicKey = await importJWK(jwk, 'ES256');
    let payload: Record<string, unknown>;
    try {
      const { payload: p } = await jwtVerify(input.proofJwt, publicKey, {
        typ: 'dpop+jwt',
        maxTokenAge: MAX_AGE_SEC,
        clockTolerance: 5,
      });
      payload = p as Record<string, unknown>;
    } catch {
      throw new Error('dpop_invalid_signature');
    }

    // 3. Bind to HTTP method and path.
    if (payload.htm !== input.method) throw new Error('dpop_htm_mismatch');

    const expectedPath = this.pathOf(input.url);
    const proofPath = this.pathOf(String(payload.htu ?? ''));
    if (expectedPath !== proofPath) throw new Error('dpop_htu_mismatch');

    // 4. Bind to the specific bearer token via ath = sha256(token) base64url.
    const expectedAth = createHash('sha256')
      .update(input.accessToken)
      .digest('base64url');
    if (payload.ath !== expectedAth) throw new Error('dpop_ath_mismatch');

    // 5. jti replay protection via Redis SET NX.
    const jti = String(payload.jti ?? '');
    if (!jti) throw new Error('dpop_missing_jti');
    const key = `dpop:jti:${jti}`;
    const ok = await this.redis.client.set(key, '1', 'EX', JTI_TTL_SEC, 'NX');
    if (ok !== 'OK') throw new Error('dpop_jti_replayed');

    // 6. The embedded JWK must match the session's registered key.
    if (!this.jwkMatches(jwk, input.expectedJwk)) {
      throw new Error('dpop_jwk_mismatch');
    }

    return { jti, jwk };
  }

  private pathOf(raw: string): string {
    if (!raw) return '';
    try {
      const u = new URL(raw, 'http://x');
      return u.pathname;
    } catch {
      return raw;
    }
  }

  private jwkMatches(a: JWK, b: JWK): boolean {
    const ac = a as { kty?: string; crv?: string; x?: string; y?: string };
    const bc = b as { kty?: string; crv?: string; x?: string; y?: string };
    return (
      ac.kty === bc.kty &&
      ac.crv === bc.crv &&
      ac.x === bc.x &&
      ac.y === bc.y
    );
  }
}