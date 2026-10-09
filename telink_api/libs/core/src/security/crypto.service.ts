import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * CryptoService - AES-256-GCM encryption for data at rest.
 *
 * Master key is read from SIGNING_KEY_MASTER (32 bytes, base64).
 * Format: base64( iv(12) || ciphertext || tag(16) )
 *
 * Used by SigningKeyService to encrypt private JWKs before storing
 * them in Postgres. Never used for user data - only for our own keys.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly masterKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const b64 = this.config.get<string>('SIGNING_KEY_MASTER');
    if (!b64) {
      throw new Error(
        'SIGNING_KEY_MASTER is not set. Generate with: openssl rand -base64 32',
      );
    }
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'SIGNING_KEY_MASTER must decode to 32 bytes (256 bits)',
      );
    }
    this.masterKey = key;
  }

  /**
   * Encrypt a UTF-8 string. Output is base64 of iv || ciphertext || tag.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, tag]).toString('base64');
  }

  /**
   * Decrypt a value produced by encrypt(). Throws if the key is wrong or
   * the ciphertext has been tampered with.
   */
  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    if (raw.length < 12 + 16) {
      throw new Error('Encrypted payload too short');
    }
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}