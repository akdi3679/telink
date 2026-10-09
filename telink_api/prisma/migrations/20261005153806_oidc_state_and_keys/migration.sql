-- CreateTable
CREATE TABLE "oidc_payloads" (
    "id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "grant_id" TEXT,
    "user_code" TEXT,
    "uid" TEXT,
    "expires_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "oidc_payloads_pkey" PRIMARY KEY ("id","model_name")
);

-- CreateTable
CREATE TABLE "oidc_signing_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kid" TEXT NOT NULL,
    "alg" TEXT NOT NULL DEFAULT 'RS256',
    "public_jwk" JSONB NOT NULL,
    "private_jwk" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),

    CONSTRAINT "oidc_signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oidc_payloads_model_name_idx" ON "oidc_payloads"("model_name");

-- CreateIndex
CREATE INDEX "oidc_payloads_grant_id_idx" ON "oidc_payloads"("grant_id");

-- CreateIndex
CREATE INDEX "oidc_payloads_uid_idx" ON "oidc_payloads"("uid");

-- CreateIndex
CREATE INDEX "oidc_payloads_expires_at_idx" ON "oidc_payloads"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oidc_signing_keys_kid_key" ON "oidc_signing_keys"("kid");

-- CreateIndex
CREATE INDEX "oidc_signing_keys_active_idx" ON "oidc_signing_keys"("active");
