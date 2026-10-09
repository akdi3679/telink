import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';
import { createHmac } from 'crypto';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21691' + rand();
const EMAIL = `p-${rand()}@example.com`;
const PASSWORD = 'Password1';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // Signup directly via API
    const start = await request(app.getHttpServer())
      .post('/auth/signup/start')
      .send({ phone: PHONE, email: EMAIL })
      .expect(201);
    const signupId = start.body.signupId;

    // Force a known code by hashing ourselves
    const code = '999888';
    const secret = process.env.JWT_SECRET ?? 'dev-only-change-me-in-production';
    const codeHash = createHmac('sha256', secret)
      .update(`${EMAIL.toLowerCase()}:${code}`)
      .digest('hex');
    await prisma.pendingSignup.update({
      where: { id: signupId },
      data: { codeHash, attempts: 0, verifiedAt: null },
    });

    const verify = await request(app.getHttpServer())
      .post('/auth/signup/verify-email')
      .send({ signupId, code })
      .expect(201);

    const done = await request(app.getHttpServer())
      .post('/auth/signup/complete')
      .send({
        signupToken: verify.body.signupToken,
        password: PASSWORD,
        firstName: 'Pat',
        lastName: 'Tester',
        role: 'student',
        jobTitle: 'Dev',
      })
      .expect(201);

    accessToken = done.body.accessToken;
    userId = done.body.user.id;
  });

  afterAll(async () => {
    try {
      const u = await prisma.user.findFirst({ where: { OR: [{ phone: PHONE }, { email: EMAIL }] } });
      if (u) {
        await prisma.session.deleteMany({ where: { userId: u.id } });
        await prisma.profile.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
      await prisma.pendingSignup.deleteMany({ where: { OR: [{ phone: PHONE }, { email: EMAIL }] } });
    } catch { /* ignore */ }
    if (app) await app.close();
  });

  it('GET /users/me without token → 401', () =>
    request(app.getHttpServer()).get('/users/me').expect(401));

  it('GET /users/me → 200 with profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.profile.firstName).toBe('Pat');
  });

  it('PATCH /users/me → 200 with updated fields', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ headline: 'Engineer', city: 'Tunis' })
      .expect(200);
    expect(res.body.profile.headline).toBe('Engineer');
    expect(res.body.profile.city).toBe('Tunis');
  });

  it('GET /users/:id → 200 public profile', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.profile.headline).toBe('Engineer');
  });
});