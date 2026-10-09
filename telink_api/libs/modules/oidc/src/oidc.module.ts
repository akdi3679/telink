import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@telink/core';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';
import { SigningKeyService } from './signing-key.service';

@Module({
  controllers: [OidcController],
  providers: [
    SigningKeyService,
    {
      provide: OidcService,
      useFactory: async (
        config: ConfigService,
        prisma: PrismaService,
        signingKeys: SigningKeyService,
      ) => {
        await signingKeys.ensureKeys();
        return new OidcService(config, prisma, signingKeys);
      },
      inject: [ConfigService, PrismaService, SigningKeyService],
    },
  ],
  exports: [OidcService, SigningKeyService],
})
export class OidcModule {}