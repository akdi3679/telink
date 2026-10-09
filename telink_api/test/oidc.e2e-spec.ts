import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';

jest.setTimeout(180000);

describe('OIDC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /oidc/.well-known/openid-configuration -> 200 with issuer', async () => {
    const res = await request(app.getHttpServer())
      .get('/oidc/.well-known/openid-configuration')
      .expect(200);
    expect(res.body.issuer).toMatch(/\/oidc$/);
    expect(res.body.token_endpoint).toContain('/oidc/token');
    expect(res.body.jwks_uri).toContain('/oidc/jwks');
  });

  it('GET /oidc/jwks -> 200 with RSA key', async () => {
    const res = await request(app.getHttpServer())
      .get('/oidc/jwks')
      .expect(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    expect(res.body.keys.length).toBeGreaterThan(0);
    expect(res.body.keys[0].kty).toBe('RSA');
    expect(res.body.keys[0].alg).toBe('RS256');
  });
});