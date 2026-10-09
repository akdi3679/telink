import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService, GeoService } from '@telink/core';
import { createHmac } from 'crypto';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21696' + rand();
const EMAIL = `geo-${rand()}@example.com`;
const PASSWORD = 'Password1';

async function signup(
  app: INestApplication,
  prisma: PrismaService,
): Promise<void> {
  const start = await request(app.getHttpServer())
    .post('/auth/signup/start')
    .send({ phone: PHONE, email: EMAIL })
    .expect(201);
  const code = '334455';
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
      firstName: 'Geo',
      lastName: 'Tester',
      role: 'student',
      jobTitle: 'Tester',
    })
    .expect(201);
}

describe('Geo lookup on login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let geo: GeoService;
  let originalLookup: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    geo = app.get(GeoService);

    // Stub the real lookup so the test is deterministic regardless
    // of whether the mmdb file is on disk.
    originalLookup = geo.lookup.bind(geo);
    (geo as any).lookup = (ip: string | null) => {
      if (!ip) return { city: null, country: null, countryCode: null, lat: null, lng: null };
      if (ip.startsWith('203.0.113.')) {
        return {
          city: 'Tunis',
          country: 'Tunisia',
          countryCode: 'TN',
          lat: 36.8065,
          lng: 10.1815,
        };
      }
      if (ip.startsWith('198.51.100.')) {
        return {
          city: 'Paris',
          country: 'France',
          countryCode: 'FR',
          lat: 48.8566,
          lng: 2.3522,
        };
      }
      return { city: null, country: null, countryCode: null, lat: null, lng: null };
    };

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
    } catch { /* ignore */ }
    if (app) await app.close();
  });

  it('stores IP-derived location on the session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-test-ip', '203.0.113.42')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);

    const session = await prisma.session.findUnique({
      where: { id: res.body.sessionId },
    });
    expect(session).toBeTruthy();
    expect(session!.geoCity).toBe('Tunis');
    expect(session!.geoCountry).toBe('Tunisia');
    expect(Number(session!.geoLat)).toBeCloseTo(36.8065, 2);
    expect(Number(session!.geoLng)).toBeCloseTo(10.1815, 2);
  });

  it('detects impossible travel across IP-derived locations', async () => {
    // Previous session: Tunis. Now login from Paris a second later.
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-test-ip', '198.51.100.7')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);

    // Impossible-travel runs async
    await new Promise((r) => setTimeout(r, 1500));

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    const ev = await prisma.securityEvent.findFirst({
      where: { userId: user!.id, action: 'auth.login.impossible_travel' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ev).toBeTruthy();
    const details = ev!.details as Record<string, unknown>;
    expect(details['previousCity']).toBe('Tunis');
    expect(details['currentCity']).toBe('Paris');
  });

  it('client-supplied x-geo-lat is ignored', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-test-ip', '203.0.113.42')
      .set('x-geo-lat', '0')
      .set('x-geo-lng', '0')
      .set('x-geo-city', 'Fake')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);

    const session = await prisma.session.findUnique({
      where: { id: res.body.sessionId },
    });
    // Session should have Tunis, not "Fake"
    expect(session!.geoCity).toBe('Tunis');
  });
});