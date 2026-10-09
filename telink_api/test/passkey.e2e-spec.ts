import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';
import { createHmac } from 'crypto';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21695' + rand();
const EMAIL = `passkey-${rand()}@example.com`;
const PASSWORD = 'Password1';

async function signup(
  app: INestApplication,
  prisma: PrismaService,
): Promise<{ accessToken: string; userId: string }> {
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

  const done = await request(app.getHttpServer())
    .post('/auth/signup/complete')
    .send({
      signupToken: verify.body.signupToken,
      password: PASSWORD,
      firstName: 'Pass',
      lastName: 'Key',
      role: 'student',
      jobTitle: 'Tester',
    })
    .expect(201);

  return { accessToken: done.body.accessToken, userId: done.body.user.id };
}

describe('Passkeys (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:8080';
    process.env.WEBAUTHN_RP_NAME = 'Telink';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const r = await signup(app, prisma);
    token = r.accessToken;
    userId = r.userId;
  });

  afterAll(async () => {
    try {
      const u = await prisma.user.findFirst({
        where: { OR: [{ phone: PHONE }, { email: EMAIL }] },
      });
      if (u) {
        await prisma.passkeyCredential.deleteMany({ where: { userId: u.id } });
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

  it('GET /auth/passkey without token -> 401', () =>
    request(app.getHttpServer()).get('/auth/passkey').expect(401));

  it('GET /auth/passkey -> empty list', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/passkey')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('POST /auth/passkey/register/begin -> proper options', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/passkey/register/begin')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My iPhone' })
      .expect(200);

    expect(res.body.challenge).toBeDefined();
    expect(typeof res.body.challenge).toBe('string');
    expect(res.body.rp).toBeDefined();
    expect(res.body.rp.id).toBe('localhost');
    expect(res.body.rp.name).toBe('Telink');
    expect(res.body.user.id).toBeDefined();
    expect(Array.isArray(res.body.pubKeyCredParams)).toBe(true);
  });

  it('POST /auth/passkey/register/finish with garbage -> 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/passkey/register/finish')
      .set('Authorization', `Bearer ${token}`)
      .send({
        response: {
          id: 'not-a-credential',
          rawId: 'not-a-credential',
          type: 'public-key',
          response: { clientDataJSON: 'x', attestationObject: 'y' },
          clientExtensionResults: {},
        },
      })
      .expect(400);
  });

  it('POST /auth/passkey/login/begin -> challenge + sessionId', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/passkey/login/begin')
      .send({ identifier: EMAIL })
      .expect(200);
    expect(res.body.options.challenge).toBeDefined();
    expect(typeof res.body.sessionId).toBe('string');
    expect(res.body.sessionId.length).toBeGreaterThan(10);
  });

  it('POST /auth/passkey/login/finish with expired session -> 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/passkey/login/finish')
      .send({
        sessionId: 'does-not-exist',
        response: {
          id: 'x',
          rawId: 'x',
          type: 'public-key',
          response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
          clientExtensionResults: {},
        },
      })
      .expect(400);
  });
});