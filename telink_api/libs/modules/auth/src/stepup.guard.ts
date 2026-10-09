import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@telink/core';
import type { JwtPayload } from '@telink/core';
import { StepUpService } from './stepup.service';
import { STEPUP_QUESTION_COUNT } from './auth.constants';

export const STEPUP_REQUIRED_KEY = 'stepup_required';
export const RequireStepUp = () => SetMetadata(STEPUP_REQUIRED_KEY, true);

export const STEPUP_EXEMPT_KEY = 'stepup_exempt';
export const StepUpExempt = () => SetMetadata(STEPUP_EXEMPT_KEY, true);

/**
 * Marks a route as requiring step-up only when the user has already
 * enrolled security questions. Used on the enroll endpoint so
 * first-time enrollment is always allowed, but changing existing
 * questions requires verification.
 */
export const STEPUP_IF_ENROLLED_KEY = 'stepup_if_enrolled';
export const RequireStepUpIfEnrolled = () =>
  SetMetadata(STEPUP_IF_ENROLLED_KEY, true);

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stepup: StepUpService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const exempt = this.reflector.getAllAndOverride<boolean>(
      STEPUP_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (exempt) return true;

    const required = this.reflector.getAllAndOverride<boolean>(
      STEPUP_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const ifEnrolled = this.reflector.getAllAndOverride<boolean>(
      STEPUP_IF_ENROLLED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required && !ifEnrolled) return true;

    // Enforcement off -> allow (dev / test).
    if (process.env.STEPUP_ENFORCED !== 'true') return true;

    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();

    if (ifEnrolled) {
      const count = await this.prisma.securityQuestion.count({
        where: { userId: req.user?.sub ?? '' },
      });
      // No questions yet -> first-time enrollment, always allowed.
      if (count < STEPUP_QUESTION_COUNT) return true;
    }

    const elevated = await this.stepup.isElevated(req.user?.sessionId);
    if (!elevated) {
      throw new ForbiddenException(
        'Step-up verification required. Verify with biometric + security questions.',
      );
    }
    return true;
  }
}