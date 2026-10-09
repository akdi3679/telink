import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import { BizErr, CurrentUser, JwtAuthGuard, JwtPayload } from '@telink/core';
import { AuthService } from './auth.service';
import { PasskeyService } from './passkey.service';
import { RequireStepUp, StepUpGuard } from './stepup.guard';

@Controller('auth/passkey')
export class PasskeyController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly auth: AuthService,
  ) {}

  @Post('register/begin')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  beginRegister(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string },
  ) {
    return this.passkeys.beginRegistration(user.sub, body?.name);
  }

  @Post('register/finish')
  @UseGuards(JwtAuthGuard, StepUpGuard)
  @RequireStepUp()
  @HttpCode(200)
  finishRegister(
    @CurrentUser() user: JwtPayload,
    @Body() body: { response: RegistrationResponseJSON },
  ) {
    if (!body?.response) throw BizErr.BadRequest('response required');
    return this.passkeys.finishRegistration(user.sub, body.response);
  }

  @Post('login/begin')
  @HttpCode(200)
  beginLogin(@Body() body: { identifier?: string }) {
    return this.passkeys.beginAuthentication(body?.identifier);
  }

  @Post('login/finish')
  @HttpCode(200)
  async finishLogin(
    @Body() body: { sessionId: string; response: AuthenticationResponseJSON },
    @Headers('user-agent') userAgent?: string,
    @Headers('x-device-id') deviceId?: string,
    @Ip() ip?: string,
  ) {
    if (!body?.sessionId || !body?.response) {
      throw BizErr.BadRequest('sessionId and response required');
    }
    const result = await this.passkeys.finishAuthentication(
      body.sessionId,
      body.response,
      {
        userAgent: userAgent ?? null,
        deviceId: deviceId ?? null,
        ip: ip ?? null,
      },
    );
    return this.auth.issueTokensForUser(result.userId, {
      userAgent: result.userAgent,
      deviceId: result.deviceId,
      ip: result.ip,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: JwtPayload) {
    return this.passkeys.listForUser(user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, StepUpGuard)
  @RequireStepUp()
  @HttpCode(200)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.passkeys.deleteForUser(user.sub, id);
  }
}