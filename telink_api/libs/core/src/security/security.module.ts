import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { SecurityEventWriter } from './security-event-writer.service';
import { SecurityEventService } from './security-event.service';
import { AdminSecurityEventsController } from './admin-security-events.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { CryptoService } from './crypto.service';
import { DpopService } from './dpop.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ?? 'dev-only-change-me-in-production',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AdminSecurityEventsController],
  providers: [
    CryptoService,
    DpopService,
    TokenService,
    SecurityEventWriter,
    SecurityEventService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    JwtModule,
    CryptoService,
    DpopService,
    TokenService,
    SecurityEventWriter,
    SecurityEventService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class SecurityModule {}