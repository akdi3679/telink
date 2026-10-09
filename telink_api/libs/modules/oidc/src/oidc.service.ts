/**
 * OidcService - owns the oidc-provider instance.
 *
 * Provider state is stored in Postgres via OidcPrismaAdapter.
 * Signing keys come from SigningKeyService (RS256, stored in DB).
 * Created once at boot, mounted at /oidc by the controller.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Provider from '@replit/oidc-provider';
import { PrismaService } from '@telink/core';
import { OidcPrismaAdapter } from './oidc-prisma.adapter';
import { SigningKeyService } from './signing-key.service';

@Injectable()
export class OidcService implements OnModuleDestroy {
  private readonly logger = new Logger(OidcService.name);
  private readonly provider: Provider;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly signingKeys: SigningKeyService,
  ) {
    const issuer =
      this.config.get<string>('OIDC_ISSUER') ??
      `${this.config.get<string>('APP_URL') ?? 'http://localhost:3000'}/oidc`;

    this.provider = new Provider(issuer, {
      adapter: (name: string) => new OidcPrismaAdapter(this.prisma, name),
      jwks: this.signingKeys.getJwks(),
      clients: [
        {
          client_id: 'telink-bff',
          client_secret:
            this.config.get<string>('OIDC_BFF_SECRET') ??
            'dev-only-bff-secret-change-me',
          redirect_uris: [],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'client_secret_post',
        },
      ],
      pkce: { required: () => true },
      features: {
        devInteractions: { enabled: false },
        introspection: { enabled: true },
        revocation: { enabled: true },
      },
      claims: {
        openid: ['sub'],
        email: ['email', 'email_verified'],
        profile: ['name', 'given_name', 'family_name'],
      },
      cookies: {
        keys: [
          this.config.get<string>('JWT_SECRET') ?? 'dev-only-cookie-key',
        ],
        sameSite: 'lax',
        long: { signed: true },
        short: { signed: true },
      },
      ttl: {
        AccessToken: 15 * 60,
        RefreshToken: 30 * 24 * 60 * 60,
        IdToken: 15 * 60,
        AuthorizationCode: 60,
      },
      scopes: ['openid', 'email', 'profile', 'offline_access'],
    });

    this.provider.on('server_error', (_ctx: unknown, err: unknown) => {
      const message =
        err instanceof Error ? err.stack ?? err.message : String(err);
      this.logger.error('OIDC server error', message);
    });
  }

  get callback() {
    return this.provider.callback();
  }

  async onModuleDestroy() {
    // oidc-provider has no explicit teardown
  }
}