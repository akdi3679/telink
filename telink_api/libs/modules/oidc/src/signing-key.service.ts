import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@telink/core';
import { CryptoService } from '@telink/core';
import { exportJWK, generateKeyPair, type JWK } from 'jose';

@Injectable()
export class SigningKeyService {
  private readonly logger = new Logger(SigningKeyService.name);
  private cachedJwks: { keys: JWK[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async ensureKeys(): Promise<void> {
    if (this.cachedJwks) return;

    const active = await this.prisma.oidcSigningKey.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    let privateJwk: JWK;
    let kid: string;

    if (active) {
      kid = active.kid;
      const stored = active.privateJwk as unknown as JWK;

      if (active.encrypted) {
        // Normal path: decrypt the stored JWK.
        const decrypted = this.crypto.decrypt(
          (stored as unknown as { enc: string }).enc,
        );
        privateJwk = JSON.parse(decrypted) as JWK;
        this.logger.log(`Loaded active signing key: ${kid} (encrypted)`);
      } else {
        // Migration path: an old plaintext key exists.
        // Encrypt it in place and use it.
        privateJwk = stored;
        const enc = this.crypto.encrypt(JSON.stringify(stored));
        await this.prisma.oidcSigningKey.update({
          where: { id: active.id },
          data: {
            privateJwk: { enc } as unknown as object,
            encrypted: true,
          },
        });
        this.logger.log(
          `Migrated signing key ${kid} to encrypted storage`,
        );
      }
    } else {
      // First boot: generate a fresh keypair.
      const { publicKey, privateKey } = await generateKeyPair('RS256', {
        extractable: true,
      });
      const pubJwk = await exportJWK(publicKey);
      const privJwk = await exportJWK(privateKey);
      kid = `key-${Date.now()}`;

      const enc = this.crypto.encrypt(JSON.stringify(privJwk));

      await this.prisma.oidcSigningKey.create({
        data: {
          kid,
          alg: 'RS256',
          publicJwk: pubJwk as object,
          privateJwk: { enc } as unknown as object,
          encrypted: true,
          active: true,
        },
      });

      privateJwk = privJwk;
      this.logger.log(`Generated new signing key: ${kid} (encrypted)`);
    }

    this.cachedJwks = {
      keys: [{ ...privateJwk, alg: 'RS256', use: 'sig', kid }],
    };
  }

  getJwks(): { keys: JWK[] } {
    if (!this.cachedJwks) {
      throw new Error('SigningKeyService.getJwks called before ensureKeys()');
    }
    return this.cachedJwks;
  }
}