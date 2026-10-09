import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';
import { createHmac } from 'crypto';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21692' + rand();
const EMAIL = `dev-${rand()}@example.com`;
const PASSWORD = 'Password1';

describe('Device identity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Create account through the API
    const start = await request(app.getHttpServer())
      .post('/auth/signup/start')
      .send({ phone: PHONE, email: EMAIL })
      .expect(201);
    const signupId = start.body.signupId;

    const code = '777111';
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
        firstName: 'Dev',
        lastName: 'Test',
        role: 'student',
        jobTitle: 'Engineer',
      })
      .expect(201);
    accessToken = done.body.accessToken;
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

  it('login with a new deviceId reports isNewDevice=true', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-device-id', 'device-alpha-1111')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    expect(res.body.isNewDevice).toBe(true);
  });

  it('same deviceId again reports isNewDevice=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-device-id', 'device-alpha-1111')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    expect(res.body.isNewDevice).toBe(false);
  });

  it('different deviceId reports isNewDevice=true', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-device-id', 'device-beta-2222')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    expect(res.body.isNewDevice).toBe(true);
  });

  it('missing deviceId falls back to User-Agent detection', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/auth/login')
      .set('user-agent', 'JestFallbackAgent/1.0')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    // First time this UA logs in — should be new
    expect(res1.body.isNewDevice).toBe(true);

    const res2 = await request(app.getHttpServer())
      .post('/auth/login')
      .set('user-agent', 'JestFallbackAgent/1.0')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    // Second time — not new
    expect(res2.body.isNewDevice).toBe(false);
  });

  it('a deviceId longer than 128 chars is ignored (falls back to UA)', async () => {
    const tooLong = 'x'.repeat(200);
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-device-id', tooLong)
      .set('user-agent', 'OverlongDeviceAgent/1.0')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    // Server normalizes the too-long id to null, then falls back to UA.
    // First time this UA logs in → new device.
    expect(res.body.isNewDevice).toBe(true);

    const res2 = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-device-id', tooLong)
      .set('user-agent', 'OverlongDeviceAgent/1.0')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);
    // Second time same UA → not new
    expect(res2.body.isNewDevice).toBe(false);
  });
});