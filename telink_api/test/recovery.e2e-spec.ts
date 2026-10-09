import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'crypto';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21698' + rand();
const EMAIL = `recovery-${rand()}@example.com`;
const PASSWORD = 'Password1';
const NEW_PASSWORD = 'NewPass2';

async function signup(app: INestApplication, prisma: PrismaService) {
  const start = await request(app.getHttpServer())
    .post('/auth/signup/start')
    .send({ phone: PHONE, email: EMAIL })
    .expect(201);
  const code = '445566';
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
      firstName: 'Rec',
      lastName: 'Tester',
      role: 'student',
      jobTitle: 'Tester',
    })
    .expect(201);
  return { accessToken: done.body.accessToken, userId: done.body.user.id };
}

describe('Account recovery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let codes: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DPOP_ENFORCED = 'false';
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
        await prisma.recoveryCode.deleteMany({ where: { userId: u.id } });
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

  it('status before generating -> 0 remaining', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/recovery/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.remaining).toBe(0);
    expect(res.body.total).toBe(0);
  });

  it('generate -> 10 codes, stored hashed', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/recovery/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body.codes)).toBe(true);
    expect(res.body.codes.length).toBe(10);
    codes = res.body.codes as string[];

    // Every code is 12 chars from the safe alphabet.
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{12}$/);
      expect(c).not.toMatch(/[01IOL]/);
    }

    // Server stores only hashes.
    const rows = await prisma.recoveryCode.findMany({ where: { userId } });
    expect(rows.length).toBe(10);
    for (const r of rows) {
      expect(r.codeHash).not.toBe('');
      for (const c of codes) {
        expect(r.codeHash).not.toBe(c);
      }
    }
  });

  it('verify with wrong code -> 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/recovery/verify')
      .send({ email: EMAIL, code: 'AAAAAAAAAAAA' })
      .expect(401);
  });

  it('verify with valid code -> resetToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/recovery/verify')
      .send({ email: EMAIL, code: codes[0] })
      .expect(200);
    expect(typeof res.body.resetToken).toBe('string');
    expect(res.body.resetToken.length).toBeGreaterThan(20);
  });

  it('complete -> new password, all sessions revoked', async () => {
    const verify = await request(app.getHttpServer())
      .post('/auth/recovery/verify')
      .send({ email: EMAIL, code: codes[1] })
      .expect(200);

    const before = await prisma.session.count({
      where: { userId, revokedAt: null },
    });
    expect(before).toBeGreaterThan(0);

    const res = await request(app.getHttpServer())
      .post('/auth/recovery/complete')
      .send({
        resetToken: verify.body.resetToken,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');

    // Old sessions gone.
    const after = await prisma.session.count({
      where: { userId, revokedAt: null },
    });
    // One new session (from the completion) is fine.
    expect(after).toBeLessThanOrEqual(1);
  });

  it('old password no longer works', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(401);
  });

  it('new password works', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: EMAIL, password: NEW_PASSWORD })
      .expect(200);
  });

  it('reused code -> 401 on second attempt', async () => {
    // codes[1] was consumed above; a fresh verify with it must fail.
    await request(app.getHttpServer())
      .post('/auth/recovery/verify')
      .send({ email: EMAIL, code: codes[1] })
      .expect(401);
  });

  it('completed flow writes security events', async () => {
    const gen = await prisma.securityEvent.count({
      where: { userId, action: 'auth.recovery.codes_generated' },
    });
    const done = await prisma.securityEvent.count({
      where: { userId, action: 'auth.recovery.completed' },
    });
    expect(gen).toBeGreaterThanOrEqual(1);
    expect(done).toBeGreaterThanOrEqual(1);
  });
});