import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, JwtPayload, TokenService } from '@telink/core';
import { RequireStepUp, StepUpGuard } from './stepup.guard';

@Controller('auth/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly tokens: TokenService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.tokens.listForUser(user.sub, user.sessionId ?? null);
  }

  @Delete()
  @UseGuards(StepUpGuard)
  @RequireStepUp()
  revokeOthers(@CurrentUser() user: JwtPayload) {
    return this.tokens.revokeAllExcept(
      user.sub,
      user.sessionId ?? null,
      'user_requested_all_others',
    );
  }

  @Delete(':id')
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tokens.revokeForUser(user.sub, id, 'user_requested');
  }
}