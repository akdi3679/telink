import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';
import { createHmac } from 'crypto';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21694' + rand();
const EMAIL = `lockout-${rand()}@example.com`;
const PASSWORD = 'Password1';

async function signup(app: INestApplication, prisma: PrismaService) {
  const start = await request(app.getHttpServer())
    .post('/auth/signup/start')
    .send({ phone: PHONE, email: EMAIL })
    .expect(201);
  const code = '112233';
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
  await request(app.getHttpServer())
    .post('/auth/signup/complete')
    .send({
      signupToken: verify.body.signupToken,
      password: PASSWORD,
      firstName: 'Lock',
      lastName: 'Tester',
      role: 'student',
      jobTitle: 'Guinea pig',
    })
    .expect(201);
}

describe('Account lockout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOCKOUT_DURATION_SEC = '3'; // shorten for the test
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await signup(app, prisma);
  });

  afterAll(async () => {
    try {
      const u = await prisma.user.findFirst({
        where: { OR: [{ phone: PHONE }, { email: EMAIL }] },
      });
      if (u) {
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

  it('correct password works before any failure', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
  });

  it('5 wrong passwords lock the account', async () => {
    for (let i = 1; i <= 4; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ identifier: EMAIL, password: 'WrongPass1' })
        .expect(401);
    }
    // 5th failure locks
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: EMAIL, password: 'WrongPass1' })
      .expect(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    expect(typeof res.body.details?.retryAfterSec).toBe('number');
  });

  it('correct password still locked during window', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('unlocks after the duration', async () => {
    await new Promise((r) => setTimeout(r, 4000));
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
  });
});