import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { PrismaService, GeoService } from '@telink/core';
import { createHmac } from 'crypto';

jest.setTimeout(180000);

const rand = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const PHONE = '+21693' + rand();
const EMAIL = `travel-${rand()}@example.com`;
const PASSWORD = 'Password1';

// IP -> location mapping used in this suite. Stubs GeoService.lookup so the
// test is deterministic regardless of whether the mmdb file exists.
const FAKE_LOOKUPS: Record<string, { city: string; country: string; lat: number; lng: number }> = {
  '203.0.113.10': { city: 'Tunis', country: 'Tunisia', lat: 36.8065, lng: 10.1815 },
  '203.0.113.20': { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
  '203.0.113.30': { city: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522 },
};

async function signup(app: INestApplication, prisma: PrismaService): Promise<string> {
  const start = await request(app.getHttpServer())
    .post('/auth/signup/start')
    .send({ phone: PHONE, email: EMAIL })
    .expect(201);
  const code = '654321';
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
      firstName: 'Travel',
      lastName: 'Tester',
      role: 'student',
      jobTitle: 'Wanderer',
    })
    .expect(201);
  return done.body.user.id;
}

describe('Impossible travel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let geo: GeoService;
  let userId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
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
    geo = app.get(GeoService);

    // Deterministic location lookup for the test.
    (geo as any).lookup = (ip: string | null) => {
      const empty = {
        city: null,
        country: null,
        countryCode: null,
        lat: null,
        lng: null,
      };
      if (!ip) return empty;
      const hit = FAKE_LOOKUPS[ip];
      if (!hit) return empty;
      return {
        city: hit.city,
        country: hit.country,
        countryCode: hit.country === 'France' ? 'FR' : 'TN',
        lat: hit.lat,
        lng: hit.lng,
      };
    };

    userId = await signup(app, prisma);
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

  it('does not flag a first login (no prior location)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-test-ip', '203.0.113.10')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);

    await new Promise((r) => setTimeout(r, 800));

    const events = await prisma.securityEvent.count({
      where: { userId, action: 'auth.login.impossible_travel' },
    });
    expect(events).toBe(0);
  });

  it('flags an impossible jump (Tunis -> Paris in seconds)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-test-ip', '203.0.113.20')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);

    await new Promise((r) => setTimeout(r, 1500));

    const events = await prisma.securityEvent.findMany({
      where: { userId, action: 'auth.login.impossible_travel' },
      orderBy: { createdAt: 'desc' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);

    const ev = events[0];
    const details = ev.details as Record<string, unknown>;
    expect(details['previousCity']).toBe('Tunis');
    expect(details['currentCity']).toBe('Paris');
    expect(Number(details['distanceKm'])).toBeGreaterThan(1000);
    expect(Number(details['speedKmh'])).toBeGreaterThan(900);
  });

  it('does not flag a plausible same-city login', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-test-ip', '203.0.113.30')
      .send({ identifier: EMAIL, password: PASSWORD })
      .expect(200);

    await new Promise((r) => setTimeout(r, 1000));

    const count = await prisma.securityEvent.count({
      where: { userId, action: 'auth.login.impossible_travel' },
    });
    // Same city (Paris -> Paris) is a distance of 0km, below the 500km
    // minimum threshold. Count should be exactly 1 (from the previous test).
    expect(count).toBe(1);
  });
});