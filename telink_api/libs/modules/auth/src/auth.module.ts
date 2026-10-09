import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsController } from './sessions.controller';
import { PasskeyController } from './passkey.controller';
import { PasskeyService } from './passkey.service';
import { LockoutService } from './lockout.service';
import { DpopController } from './dpop.controller';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';
import { StepUpController } from './stepup.controller';
import { StepUpService } from './stepup.service';
import { StepUpGuard } from './stepup.guard';
import { LoginHistoryController } from './login-history.controller';

@Module({
  controllers: [
    AuthController,
    SessionsController,
    PasskeyController,
    DpopController,
    RecoveryController,
    StepUpController,
    LoginHistoryController,
  ],
  providers: [
    AuthService,
    LockoutService,
    PasskeyService,
    RecoveryService,
    StepUpService,
    StepUpGuard,
  ],
  exports: [
    AuthService,
    PasskeyService,
    RecoveryService,
    StepUpService,
    StepUpGuard,
  ],
})
export class AuthModule {}