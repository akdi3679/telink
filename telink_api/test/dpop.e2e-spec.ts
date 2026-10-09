import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { createHash, createHmac, randomUUID } from 'crypto';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService } from '@telink/core';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21697' + rand();
const EMAIL = `dpop-${rand()}@example.com`;
const PASSWORD = 'Password1';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function buildProof(params: {
  privateKey: any;
  publicJwk: any;
  method: string;
  htu: string;
  accessToken: string;
  jti?: string;
}): Promise<string> {
  const ath = createHash('sha256')
    .update(params.accessToken)
    .digest('base64url');
  return new SignJWT({
    htm: params.method,
    htu: params.htu,
    iat: Math.floor(Date.now() / 1000),
    jti: params.jti ?? randomUUID(),
    ath,
  })
    .setProtectedHeader({
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: params.publicJwk,
    })
    .sign(params.privateKey);
}

async function signupAndLogin(app: INestApplication): Promise<{
  accessToken: string;
  sessionId: string;
  userId: string;
}> {
  const start = await request(app.getHttpServer())
    .post('/auth/signup/start')
    .send({ phone: PHONE, email: EMAIL })
    .expect(201);
  const code = '424242';
  const secret = process.env.JWT_SECRET ?? 'dev-only-change-me-in-production';
  const codeHash = createHmac('sha256', secret)
    .update(`${EMAIL.toLowerCase()}:${code}`)
    .digest('hex');
  const prisma: PrismaService = app.get(PrismaService);
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
      firstName: 'Dpop',
      lastName: 'Tester',
      role: 'student',
      jobTitle: 'Tester',
    })
    .expect(201);

  return {
    accessToken: done.body.accessToken,
    sessionId: done.body.sessionId,
    userId: done.body.user.id,
  };
}

describe('DPoP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let sessionId: string;
  let userId: string;
  let publicJwk: any;
  let privateKey: any;

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
    const r = await signupAndLogin(app);
    accessToken = r.accessToken;
    sessionId = r.sessionId;
    userId = r.userId;

    const kp = await generateKeyPair('ES256', { extractable: true });
    privateKey = kp.privateKey;
    publicJwk = await exportJWK(kp.publicKey);
  });

  afterAll(async () => {
    process.env.DPOP_ENFORCED = 'false';
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

  it('GET /auth/dpop/status -> registered=false initially', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/dpop/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.registered).toBe(false);
    expect(res.body.enforced).toBe(false);
  });

  it('POST /auth/dpop/register rejects invalid keys', async () => {
    await request(app.getHttpServer())
      .post('/auth/dpop/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ publicKey: { kty: 'RSA', n: 'x', e: 'AQAB' } })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/dpop/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        publicKey: {
          kty: 'EC',
          crv: 'P-256',
          x: 'aaa',
          y: 'bbb',
          d: 'private-part',
        },
      })
      .expect(400);
  });

  it('POST /auth/dpop/register accepts a valid P-256 public key', async () => {
    await request(app.getHttpServer())
      .post('/auth/dpop/register')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ publicKey: publicJwk, deviceName: 'jest-test' })
      .expect(200);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    expect(session?.dpopPublicKeyJwk).toBeTruthy();
  });

  it('valid DPoP proof passes verification (enforcement off)', async () => {
    const proof = await buildProof({
      privateKey,
      publicJwk,
      method: 'GET',
      htu: '/auth/me',
      accessToken,
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('DPoP', proof)
      .expect(200);
  });

  it('invalid DPoP signature -> 401 even with enforcement off', async () => {
    const proof = await buildProof({
      privateKey,
      publicJwk,
      method: 'GET',
      htu: '/auth/me',
      accessToken,
    });
    const tampered = proof.slice(0, -1) + (proof.slice(-1) === 'A' ? 'B' : 'A');
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('DPoP', tampered)
      .expect(401);
  });

  it('replayed jti -> 401', async () => {
    const jti = randomUUID();
    const proof = await buildProof({
      privateKey,
      publicJwk,
      method: 'GET',
      htu: '/auth/me',
      accessToken,
      jti,
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('DPoP', proof)
      .expect(200);

    const proof2 = await buildProof({
      privateKey,
      publicJwk,
      method: 'GET',
      htu: '/auth/me',
      accessToken,
      jti,
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('DPoP', proof2)
      .expect(401);
  });

  it('enforcement on + no proof -> 401', async () => {
    process.env.DPOP_ENFORCED = 'true';
    try {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    } finally {
      process.env.DPOP_ENFORCED = 'false';
    }
  });

  it('enforcement on + valid proof -> 200', async () => {
    process.env.DPOP_ENFORCED = 'true';
    try {
      const proof = await buildProof({
        privateKey,
        publicJwk,
        method: 'GET',
        htu: '/auth/me',
        accessToken,
      });
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('DPoP', proof)
        .expect(200);
    } finally {
      process.env.DPOP_ENFORCED = 'false';
    }
  });

  it('register endpoint still works when enforcement is on', async () => {
    process.env.DPOP_ENFORCED = 'true';
    try {
      await request(app.getHttpServer())
        .post('/auth/dpop/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ publicKey: publicJwk })
        .expect(200);
    } finally {
      process.env.DPOP_ENFORCED = 'false';
    }
  });
});