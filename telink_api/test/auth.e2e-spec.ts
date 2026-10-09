import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const TEST_PHONE = '+21690' + rand();
const TEST_EMAIL = `test-${rand()}@example.com`;
const TEST_PASSWORD = 'Password1';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signupId: string;
  let signupToken: string;
  let accessToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      const u = await prisma.user.findFirst({
        where: { OR: [{ phone: TEST_PHONE }, { email: TEST_EMAIL }] },
      });
      if (u) {
        await prisma.session.deleteMany({ where: { userId: u.id } });
        await prisma.profile.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
      await prisma.pendingSignup.deleteMany({
        where: { OR: [{ phone: TEST_PHONE }, { email: TEST_EMAIL }] },
      });
    } catch {
      /* ignore */
    }
    if (app) await app.close();
  });

  it('GET /auth/me without a token → 401', () =>
    request(app.getHttpServer()).get('/auth/me').expect(401));

  it('POST /auth/signup/start → 201 with signupId', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup/start')
      .send({ phone: TEST_PHONE, email: TEST_EMAIL })
      .expect(201);
    expect(res.body.signupId).toBeDefined();
    signupId = res.body.signupId;
  });

  it('POST /auth/signup/verify-email with wrong code → 500-ish', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup/verify-email')
      .send({ signupId, code: '000000' })
      .expect((r) => {
        if (r.status === 201) throw new Error('expected failure');
      });
  });

  it('POST /auth/signup/verify-email with right code → 201 with signupToken', async () => {
    // Pull the code from the pending row (email is console in dev)
    const pending = await prisma.pendingSignup.findUnique({
      where: { id: signupId },
    });
    expect(pending).toBeTruthy();
    // We cannot reverse the hash; use the service to make a new signup with known code.
    // Simpler: create a fresh pending row and force its codeHash ourselves.
    const code = '111222';
    const { createHmac } = await import('crypto');
    const secret =
      process.env.JWT_SECRET ?? 'dev-only-change-me-in-production';
    const codeHash = createHmac('sha256', secret)
      .update(`${TEST_EMAIL}:${code}`)
      .digest('hex');
    await prisma.pendingSignup.update({
      where: { id: signupId },
      data: { codeHash, attempts: 0, verifiedAt: null },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/signup/verify-email')
      .send({ signupId, code })
      .expect(201);
    expect(res.body.signupToken).toBeDefined();
    signupToken = res.body.signupToken;
  });

  it('POST /auth/signup/complete → 201 with tokens + profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup/complete')
      .send({
        signupToken,
        password: TEST_PASSWORD,
        firstName: 'Test',
        lastName: 'User',
        role: 'student',
        jobTitle: 'Engineer',
      })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.profile.firstName).toBe('Test');
    accessToken = res.body.accessToken;
  });

  it('GET /auth/me with token → 200 with profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.profile.role).toBe('student');
  });

  it('POST /auth/login with email → 200 with tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /auth/login with phone → 200 with tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: TEST_PHONE, password: TEST_PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /auth/login with wrong password → non-2xx', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: TEST_EMAIL, password: 'WrongPass9' })
      .expect((r) => {
        if (r.status === 200) throw new Error('expected failure');
      });
  });

  it('POST /auth/signup/start with taken phone → non-2xx', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup/start')
      .send({ phone: TEST_PHONE, email: `other-${rand()}@example.com` })
      .expect((r) => {
        if (r.status === 201) throw new Error('expected failure');
      });
  });
});