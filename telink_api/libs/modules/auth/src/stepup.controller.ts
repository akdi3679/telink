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
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@telink/core';
import { StepUpService } from './stepup.service';
import {
  RequireStepUpIfEnrolled,
  StepUpGuard,
} from './stepup.guard';

@Controller('auth/stepup')
@UseGuards(JwtAuthGuard)
export class StepUpController {
  constructor(private readonly stepup: StepUpService) {}

  /**
   * Enroll or replace security questions.
   *
   * First-time enrollment is always allowed. Changing existing questions
   * requires step-up verification first (protected by StepUpGuard when
   * the user already has 3 questions).
   */
  @Post('questions/enroll')
  @UseGuards(StepUpGuard)
  @RequireStepUpIfEnrolled()
  @HttpCode(200)
  async enroll(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      questions: Array<{
        questionKey: string;
        questionText?: string;
        answer: string;
      }>;
    },
  ) {
    return this.stepup.enroll(user.sub, body?.questions ?? []);
  }

  @Get('questions')
  async questions(@CurrentUser() user: JwtPayload) {
    return this.stepup.getQuestions(user.sub);
  }

  @Get('status')
  async status(@CurrentUser() user: JwtPayload) {
    return this.stepup.status(user.sub, user.sessionId);
  }

  @Post('verify')
  @HttpCode(200)
  async verify(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      answers: Array<{ questionId: string; answer: string }>;
    },
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    return this.stepup.verify(user.sub, user.sessionId, body?.answers ?? [], {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('biometric')
  @HttpCode(200)
  async biometric(
    @CurrentUser() user: JwtPayload,
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    return this.stepup.recordBiometric(user.sub, user.sessionId, {
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }

  @Post('clear')
  @HttpCode(200)
  async clear(@CurrentUser() user: JwtPayload) {
    if (user.sessionId) await this.stepup.clearElevated(user.sessionId);
    return { ok: true };
  }
}