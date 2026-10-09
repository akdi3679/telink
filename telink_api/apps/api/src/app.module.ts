import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import {
  AllExceptionsFilter,
  CoreConfigModule,
  PrismaModule,
  RedisModule,
  EmailModule,
  SecurityModule,
  GeoModule,
} from '@telink/core';
import { AuthModule } from '@telink/modules/auth';
import { UsersModule } from '@telink/modules/users';
import { OidcModule } from '@telink/modules/oidc';

import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => [
        { name: 'short', ttl: 1000, limit: 10 },
        { name: 'medium', ttl: 60_000, limit: 60 },
      ],
    }),

    CoreConfigModule,
    PrismaModule,
    RedisModule,
    EmailModule,
    SecurityModule,
    GeoModule,

    AuthModule,
    UsersModule,
    OidcModule,

    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}