/**
 * OidcPrismaAdapter - persistence layer for oidc-provider state.
 *
 * oidc-provider instantiates one adapter per model (Session, AccessToken,
 * AuthorizationCode, RefreshToken, Grant, Interaction, ReplayDetection, ...).
 * All rows live in the single `OidcPayload` table; the adapter routes by
 * `modelName`.
 *
 * Contract (oidc-provider v8):
 *   upsert(id, payload, expiresIn) -> Promise<void>
 *   find(id)                       -> Promise<Payload | undefined>
 *   findByUserCode(userCode)       -> Promise<Payload | undefined>
 *   findByUid(uid)                 -> Promise<Payload | undefined>
 *   consume(id)                    -> Promise<void>
 *   destroy(id)                    -> Promise<void>
 *   revokeByGrantId(grantId)       -> Promise<void>
 */
import { PrismaService } from '@telink/core';

export class OidcPrismaAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelName: string,
  ) {}

  async upsert(
    id: string,
    payload: Record<string, unknown>,
    expiresIn: number,
  ): Promise<void> {
    const expiresAt =
      expiresIn && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null;

    const grantId = (payload['grantId'] as string | undefined) ?? null;
    const userCode = (payload['userCode'] as string | undefined) ?? null;
    const uid = (payload['uid'] as string | undefined) ?? null;

    await this.prisma.oidcPayload.upsert({
      where: { id_modelName: { id, modelName: this.modelName } },
      update: {
        payload: payload as object,
        expiresAt,
        grantId,
        userCode,
        uid,
      },
      create: {
        id,
        modelName: this.modelName,
        payload: payload as object,
        expiresAt,
        grantId,
        userCode,
        uid,
      },
    });
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    const row = await this.prisma.oidcPayload.findUnique({
      where: { id_modelName: { id, modelName: this.modelName } },
    });
    if (!row) return undefined;
    if (row.consumedAt) return undefined;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return undefined;
    return row.payload as Record<string, unknown>;
  }

  async findByUserCode(
    userCode: string,
  ): Promise<Record<string, unknown> | undefined> {
    const row = await this.prisma.oidcPayload.findFirst({
      where: { modelName: this.modelName, userCode },
    });
    if (!row) return undefined;
    if (row.consumedAt) return undefined;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return undefined;
    return row.payload as Record<string, unknown>;
  }

  async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
    const row = await this.prisma.oidcPayload.findFirst({
      where: { modelName: this.modelName, uid },
    });
    if (!row) return undefined;
    if (row.consumedAt) return undefined;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return undefined;
    return row.payload as Record<string, unknown>;
  }

  async consume(id: string): Promise<void> {
    await this.prisma.oidcPayload.update({
      where: { id_modelName: { id, modelName: this.modelName } },
      data: { consumedAt: new Date() },
    });
  }

  async destroy(id: string): Promise<void> {
    await this.prisma.oidcPayload.deleteMany({
      where: { id, modelName: this.modelName },
    });
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.prisma.oidcPayload.deleteMany({
      where: { modelName: this.modelName, grantId },
    });
  }
}