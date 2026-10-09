import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'crypto';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21699' + rand();
const EMAIL = `stepup-${rand()}@example.com`;
const PASSWORD = 'Password1';

async function signup(app: INestApplication, prisma: PrismaService) {
  const start = await request(app.getHttpServer())
    .post('/auth/signup/start')
    .send({ phone: PHONE, email: EMAIL })
    .expect(201);
  const code = '778899';
  const secret = process.env.JWT_SECRET ?? 'dev-only-change-me-in-production';
  const codeHash = createHmac('sha256', secret)
    .update(`${EMAIL.toLowerCase()}:${code}`)
    .digest('hex');
  await prisma.pendingSignup.update({
    where: { id: start.body.signupId },
    data: { codeHash, attempts: 0, verifiedAt: null },
  });
  const verify = await request(app.getHttpServer())
    .post('/auth/signup/verify-email')
    .send({ signupId: start.body.signupId, code })
    .expect(201);
  const done = await request(app.getHttpServer())
    .post('/auth/signup/complete')
    .send({
      signupToken: verify.body.signupToken,
      password: PASSWORD,
      firstName: 'Step',
      lastName: 'Tester',
      role: 'student',
      jobTitle: 'Tester',
    })
    .expect(201);
  return {
    accessToken: done.body.accessToken,
    userId: done.body.user.id,
    sessionId: done.body.sessionId,
  };
}

describe('Step-up (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let questionIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DPOP_ENFORCED = 'false';
    process.env.STEPUP_ENFORCED = 'false'; // relaxed for these tests
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const r = await signup(app, prisma);
    accessToken = r.accessToken;
    userId = r.userId;
  });

  afterAll(async () => {
    try {
      const u = await prisma.user.findFirst({
        where: { OR: [{ phone: PHONE }, { email: EMAIL }] },
      });
      if (u) {
        await prisma.securityQuestion.deleteMany({ where: { userId: u.id } });
        await prisma.securityEvent.deleteMany({ where: { userId: u.id } });
        await prisma.session.deleteMany({ where: { userId: u.id } });
        await prisma.profile.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
      await prisma.pendingSignup.deleteMany({
        where: { OR: [{ phone: PHONE }, { email: EMAIL }] },
      });
    } catch {
      /* ignore */
    }
    if (app) await app.close();
  });

  it('status -> not enrolled, not elevated', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/stepup/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.hasQuestions).toBe(false);
    expect(res.body.elevated).toBe(false);
  });

  it('enroll requires exactly 3 questions', async () => {
    await request(app.getHttpServer())
      .post('/auth/stepup/questions/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questions: [] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/stepup/questions/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        questions: [
          { questionKey: 'pet', answer: 'Rex' },
          { questionKey: 'city', answer: 'Tunis' },
        ],
      })
      .expect(400);
  });

  it('enroll -> 3 questions, hashed', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/stepup/questions/enroll')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        questions: [
          { questionKey: 'first_pet', questionText: 'First pet?', answer: 'Rex' },
          { questionKey: 'birth_city', questionText: 'City you were born?', answer: 'Tunis' },
          { questionKey: 'fav_teacher', questionText: 'Favorite teacher?', answer: 'Ms. Fatma' },
        ],
      })
      .expect(200);
    expect(res.body.count).toBe(3);

    const rows = await prisma.securityQuestion.findMany({ where: { userId } });
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.answerHash).not.toBe('');
      expect(r.answerHash).not.toBe('Rex');
      expect(r.answerHash).not.toBe('Tunis');
    }
  });

  it('GET /questions -> 3 entries, no answers', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/stepup/questions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    questionIds = res.body.map((q: { id: string }) => q.id);
    for (const q of res.body) {
      expect(q.answerHash).toBeUndefined();
      expect(q.questionKey).toBeDefined();
    }
  });

  it('verify with wrong answers -> 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/stepup/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        answers: [
          { questionId: questionIds[0], answer: 'wrong' },
          { questionId: questionIds[1], answer: 'wrong' },
        ],
      })
      .expect(401);
  });

  it('verify with correct 2 of 3 -> elevated', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/stepup/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        answers: [
          { questionId: questionIds[0], answer: 'Rex' },
          { questionId: questionIds[1], answer: 'Tunis' },
        ],
      })
      .expect(200);
    expect(res.body.elevated).toBe(true);
    expect(typeof res.body.expiresAt).toBe('string');
  });

  it('status after verify -> elevated=true', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/stepup/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.elevated).toBe(true);
    expect(res.body.hasQuestions).toBe(true);
  });

  it('answers are case-insensitive and whitespace-normalized', async () => {
    // clear elevated first
    await request(app.getHttpServer())
      .post('/auth/stepup/clear')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/stepup/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        answers: [
          { questionId: questionIds[0], answer: '  REX  ' },
          { questionId: questionIds[1], answer: 'TUNIS' },
        ],
      })
      .expect(200);
  });

  it('clear -> elevated=false', async () => {
    await request(app.getHttpServer())
      .post('/auth/stepup/clear')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/auth/stepup/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.elevated).toBe(false);
  });
});