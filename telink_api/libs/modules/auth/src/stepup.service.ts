import { Injectable, Logger } from '@nestjs/common';
import { BizErr, PrismaService, RedisService, SecurityEventWriter } from '@telink/core';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import {
  STEPUP_ANSWER_MAX_LENGTH,
  STEPUP_ANSWER_MIN_LENGTH,
  STEPUP_ELEVATED_TTL_SEC,
  STEPUP_MAX_ATTEMPTS_PER_HOUR,
  STEPUP_QUESTION_COUNT,
  STEPUP_REQUIRED_ANSWERS,
} from './auth.constants';

export interface QuestionInput {
  questionKey: string;
  questionText?: string;
  /** Empty string means "keep existing hash for this questionKey". */
  answer?: string;
}

@Injectable()
export class StepUpService {
  private readonly logger = new Logger(StepUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: SecurityEventWriter,
  ) {}

  // ── Enrollment ─────────────────────────────────────────────

  async enroll(userId: string, questions: QuestionInput[]) {
    if (!Array.isArray(questions) || questions.length !== STEPUP_QUESTION_COUNT) {
      throw BizErr.BadRequest(
        `Exactly ${STEPUP_QUESTION_COUNT} questions are required`,
      );
    }

    const existing = await this.prisma.securityQuestion.findMany({
      where: { userId },
    });
    const existingByKey = new Map(existing.map((e) => [e.questionKey, e]));

    // Validate each slot.
    const keys = new Set<string>();
    for (const q of questions) {
      if (!q.questionKey || typeof q.questionKey !== 'string') {
        throw BizErr.BadRequest('questionKey required for every question');
      }
      if (keys.has(q.questionKey)) {
        throw BizErr.BadRequest('Duplicate question keys are not allowed');
      }
      keys.add(q.questionKey);

      const answer = this.normalizeAnswer(q.answer ?? '');
      if (answer.length > 0) {
        // New answer provided - validate length.
        if (
          answer.length < STEPUP_ANSWER_MIN_LENGTH ||
          answer.length > STEPUP_ANSWER_MAX_LENGTH
        ) {
          throw BizErr.BadRequest(
            `Answer must be between ${STEPUP_ANSWER_MIN_LENGTH} and ${STEPUP_ANSWER_MAX_LENGTH} characters`,
          );
        }
      } else if (!existingByKey.has(q.questionKey)) {
        // Empty answer for a question that is NOT already in the DB.
        // We have no old hash to keep, so this is invalid.
        throw BizErr.BadRequest(
          `An answer is required for question: ${q.questionKey}`,
        );
      }
    }

    // Wipe old, recreate from scratch.
    await this.prisma.securityQuestion.deleteMany({ where: { userId } });

    let updated = 0;
    let kept = 0;
    for (const q of questions) {
      const answer = this.normalizeAnswer(q.answer ?? '');
      let answerHash: string;
      if (answer.length > 0) {
        answerHash = await argonHash(answer);
        updated++;
      } else {
        // Keep existing hash for this key.
        answerHash = existingByKey.get(q.questionKey)!.answerHash;
        kept++;
      }
      await this.prisma.securityQuestion.create({
        data: {
          userId,
          questionKey: q.questionKey,
          questionText: q.questionText ?? null,
          answerHash,
        },
      });
    }

    await this.events.write({
      userId,
      action: 'auth.stepup.questions_enrolled',
      details: { count: questions.length, updated, kept },
    });

    return { ok: true, count: questions.length, updated, kept };
  }

  // ── Read questions (no answers) ────────────────────────────

  async getQuestions(userId: string) {
    const rows = await this.prisma.securityQuestion.findMany({
      where: { userId },
      select: { id: true, questionKey: true, questionText: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows;
  }

  async status(userId: string, sessionId: string | undefined) {
    const count = await this.prisma.securityQuestion.count({
      where: { userId },
    });
    let elevated = false;
    let expiresAt: string | null = null;
    if (sessionId) {
      const raw = await this.redis.client.get(`stepup:elevated:${sessionId}`);
      if (raw) {
        elevated = true;
        const ttl = await this.redis.client.ttl(`stepup:elevated:${sessionId}`);
        expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      }
    }
    return {
      hasQuestions: count === STEPUP_QUESTION_COUNT,
      questionCount: count,
      elevated,
      elevatedExpiresAt: expiresAt,
      enforced: process.env.STEPUP_ENFORCED === 'true',
    };
  }

  // ── Verify answers ─────────────────────────────────────────

  async verify(
    userId: string,
    sessionId: string | undefined,
    answers: Array<{ questionId: string; answer: string }>,
    ctx: { ip?: string | null; userAgent?: string | null },
  ) {
    if (!sessionId) throw BizErr.BadRequest('No session');

    if (!Array.isArray(answers) || answers.length !== STEPUP_REQUIRED_ANSWERS) {
      throw BizErr.BadRequest(
        `Exactly ${STEPUP_REQUIRED_ANSWERS} answers required`,
      );
    }

    // Rate limit by user.
    const rlKey = `stepup:attempts:${userId}`;
    const attempts = await this.redis.client.incr(rlKey);
    if (attempts === 1) {
      await this.redis.client.expire(rlKey, 3600);
    }
    if (attempts > STEPUP_MAX_ATTEMPTS_PER_HOUR) {
      throw BizErr.TooManyRequests(
        'Too many verification attempts. Try again later.',
      );
    }

    const rows = await this.prisma.securityQuestion.findMany({
      where: { userId },
    });

    const byId = new Map(rows.map((r) => [r.id, r] as const));

    let passed = 0;
    for (const a of answers) {
      const row = byId.get(a.questionId);
      if (!row) continue;
      const ok = await argonVerify(
        row.answerHash,
        this.normalizeAnswer(a.answer),
      ).catch(() => false);
      if (ok) passed++;
    }

    if (passed < STEPUP_REQUIRED_ANSWERS) {
      await this.events.write({
        userId,
        sessionId,
        action: 'auth.stepup.failed',
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        details: { passed, required: STEPUP_REQUIRED_ANSWERS },
      });
      throw BizErr.Unauthorized('One or more answers are incorrect');
    }

    // Success - issue elevated token bound to the session.
    const key = `stepup:elevated:${sessionId}`;
    await this.redis.client.set(
      key,
      JSON.stringify({
        userId,
        verifiedAt: new Date().toISOString(),
        factors: ['security_questions'],
      }),
      'EX',
      STEPUP_ELEVATED_TTL_SEC,
    );

    // Clear rate limit on success.
    await this.redis.client.del(rlKey);

    await this.events.write({
      userId,
      sessionId,
      action: 'auth.stepup.passed',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    const expiresAt = new Date(Date.now() + STEPUP_ELEVATED_TTL_SEC * 1000);
    return { elevated: true, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Called after biometric is verified client-side. Records that the
   * biometric factor was satisfied. Combine with security_questions to
   * elevate the session.
   */
  async recordBiometric(
    userId: string,
    sessionId: string | undefined,
    ctx: { ip?: string | null; userAgent?: string | null },
  ) {
    if (!sessionId) throw BizErr.BadRequest('No session');

    const key = `stepup:factors:${sessionId}`;
    const existingRaw = await this.redis.client.get(key);
    const existing: string[] = existingRaw ? JSON.parse(existingRaw).factors : [];
    const factors = Array.from(new Set([...existing, 'biometric']));
    await this.redis.client.set(
      key,
      JSON.stringify({ factors }),
      'EX',
      STEPUP_ELEVATED_TTL_SEC,
    );

    await this.events.write({
      userId,
      sessionId,
      action: 'auth.stepup.biometric_recorded',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { factors };
  }

  /**
   * Called by the StepUpGuard. Returns true if the session is elevated.
   */
  async isElevated(sessionId: string | undefined): Promise<boolean> {
    if (!sessionId) return false;
    const raw = await this.redis.client.get(`stepup:elevated:${sessionId}`);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw) as { userId: string };
      return !!data.userId;
    } catch {
      return false;
    }
  }

  async clearElevated(sessionId: string): Promise<void> {
    await this.redis.client.del(`stepup:elevated:${sessionId}`);
    await this.redis.client.del(`stepup:factors:${sessionId}`);
  }

  private normalizeAnswer(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}