import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  BizErr,
  CurrentUser,
  JwtAuthGuard,
  JwtPayload,
} from '@telink/core';
import { RecoveryService } from './recovery.service';
import { RequireStepUp, StepUpGuard } from './stepup.guard';

@Controller('auth/recovery')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  // ── Authenticated: manage codes ───────────────────────────

  @Post('generate')
  @UseGuards(JwtAuthGuard, StepUpGuard)
  @RequireStepUp()
  @HttpCode(200)
  generate(@CurrentUser() user: JwtPayload) {
    return this.recovery.generateCodes(user.sub);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: JwtPayload) {
    return this.recovery.status(user.sub);
  }

  // ── Public: reset flow ────────────────────────────────────

  @Post('verify')
  @HttpCode(200)
  verify(
    @Body() body: { email: string; code: string },
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    if (!body?.email || !body?.code) {
      throw BizErr.BadRequest('email and code required');
    }
    return this.recovery.verify(body.email, body.code, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('complete')
  @HttpCode(200)
  complete(
    @Body() body: { resetToken: string; newPassword: string },
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    if (!body?.resetToken || !body?.newPassword) {
      throw BizErr.BadRequest('resetToken and newPassword required');
    }
    // Match the same password rule as signup.
    if (
      body.newPassword.length < 8 ||
      !/[A-Za-z]/.test(body.newPassword) ||
      !/\d/.test(body.newPassword)
    ) {
      throw BizErr.BadRequest(
        'Password must be at least 8 characters and contain a letter and a number',
      );
    }
    return this.recovery.complete(body.resetToken, body.newPassword, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }
}