import {
  Body,
  Controller,
    Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BizErr, CurrentUser, JwtAuthGuard, JwtPayload } from '@telink/core';
import { AuthService } from './auth.service';
import {
  LoginDto,
  SignupCompleteDto,
  SignupStartDto,
  SignupVerifyEmailDto,
} from './dto';

function resolveClientIp(
  realIp: string | undefined,
  testIp: string | undefined,
): string | null {
  // In test mode, x-test-ip overrides the real IP. This lets tests
  // simulate logins from different networks. Never enabled in production.
  if (process.env.NODE_ENV === 'test' && testIp) return testIp;
  return realIp ?? null;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup/start')
  @HttpCode(201)
  signupStart(@Body() dto: SignupStartDto) {
    return this.auth.signupStart(dto.phone, dto.email);
  }

  @Post('signup/verify-email')
  @HttpCode(201)
  signupVerifyEmail(@Body() dto: SignupVerifyEmailDto) {
    return this.auth.signupVerifyEmail(dto.signupId, dto.code);
  }

  @Post('signup/complete')
  @HttpCode(201)
  signupComplete(@Body() dto: SignupCompleteDto) {
    return this.auth.signupComplete(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-test-ip') testIp?: string,
    @Ip() ip?: string,
  ) {
    return this.auth.login(dto.identifier, dto.password, {
      userAgent: userAgent ?? null,
      deviceId: deviceId ?? null,
      ip: resolveClientIp(ip, testIp),
    });
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: { refreshToken: string },
    @Headers('user-agent') userAgent?: string,
    @Headers('x-device-id') deviceId?: string,
    @Ip() ip?: string,
  ) {
    if (!body?.refreshToken) {
      throw BizErr.BadRequest('refreshToken is required');
    }
    try {
      return await this.auth.refresh(body.refreshToken, {
        userAgent: userAgent ?? null,
        deviceId: deviceId ?? null,
        ip: ip ?? null,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'replay_detected') {
        throw BizErr.Unauthorized(
          'Session revoked: refresh token replay detected',
        );
      }
      if (msg === 'invalid_token') {
        throw BizErr.Unauthorized('Invalid refresh token');
      }
      if (msg === 'session_revoked') {
        throw BizErr.Unauthorized('Session has been revoked');
      }
      if (msg === 'token_expired') {
        throw BizErr.Unauthorized('Refresh token expired');
      }
      throw e;
    }
  }
  @Post('password/change')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body?.currentPassword || !body?.newPassword) {
      throw BizErr.BadRequest('currentPassword and newPassword required');
    }
    if (
      body.newPassword.length < 8 ||
      !/[A-Za-z]/.test(body.newPassword) ||
      !/\d/.test(body.newPassword)
    ) {
      throw BizErr.BadRequest(
        'Password must be at least 8 characters and contain a letter and a number',
      );
    }
    return this.auth.changePassword(user.sub, body.currentPassword, body.newPassword);
  }

  @Delete('account')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: JwtPayload) {
    await this.auth.deleteAccount(user.sub);
  }
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.getMe(user.sub);
  }
}