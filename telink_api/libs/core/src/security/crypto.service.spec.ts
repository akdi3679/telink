import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';
import { randomBytes } from 'crypto';

describe('CryptoService', () => {
  let service: CryptoService;
  const keyB64 = randomBytes(32).toString('base64');

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: { get: () => keyB64 },
        },
      ],
    }).compile();
    service = moduleRef.get(CryptoService);
  });

  it('round-trips plaintext', () => {
    const plain = '{"kty":"RSA","n":"abc","d":"secret"}';
    const enc = service.encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(service.decrypt(enc)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext (IV is random)', () => {
    const plain = 'hello';
    const a = service.encrypt(plain);
    const b = service.encrypt(plain);
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe(plain);
    expect(service.decrypt(b)).toBe(plain);
  });

  it('rejects tampered ciphertext', () => {
    const enc = service.encrypt('hello');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip the last byte of the tag
    const tampered = buf.toString('base64');
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('rejects a different master key', async () => {
    const otherKey = randomBytes(32).toString('base64');
    const moduleRef = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: { get: () => otherKey },
        },
      ],
    }).compile();
    const other = moduleRef.get(CryptoService);

    const enc = service.encrypt('hello');
    expect(() => other.decrypt(enc)).toThrow();
  });

  it('rejects a short master key', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: { get: () => Buffer.from('short').toString('base64') },
          },
        ],
      }).compile(),
    ).rejects.toThrow();
  });
});