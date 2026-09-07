CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "AiChannelType" AS ENUM ('OPENAI_COMPATIBLE');
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CLOSED', 'REFUNDED');

ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "mini_openid" TEXT,
  ADD COLUMN "mini_unionid" TEXT,
  ADD COLUMN "nickname" TEXT,
  ADD COLUMN "avatar_url" TEXT;

CREATE UNIQUE INDEX "users_mini_openid_key" ON "users"("mini_openid");
UPDATE "users" SET "role" = 'ADMIN' WHERE "username" = 'admin';

CREATE TABLE "ai_channels" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AiChannelType" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  "base_url" TEXT NOT NULL,
  "encrypted_api_key" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_channels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_channels_is_active_updated_at_idx" ON "ai_channels"("is_active", "updated_at");

CREATE TABLE "ai_models" (
  "id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "display_name" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "context_window" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_models_channel_id_name_key" ON "ai_models"("channel_id", "name");
CREATE INDEX "ai_models_is_active_channel_id_idx" ON "ai_models"("is_active", "channel_id");
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "ai_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "feature_flags" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "api_integrations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "method" "HttpMethod" NOT NULL,
  "encrypted_headers" TEXT,
  "request_params" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_integrations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_integrations_enabled_updated_at_idx" ON "api_integrations"("enabled", "updated_at");

CREATE TABLE "api_integration_variables" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "response_path" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_integration_variables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_integration_variables_integration_id_name_key" ON "api_integration_variables"("integration_id", "name");
CREATE INDEX "api_integration_variables_name_idx" ON "api_integration_variables"("name");
ALTER TABLE "api_integration_variables" ADD CONSTRAINT "api_integration_variables_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "api_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_orders" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "scene_token" TEXT,
  "out_trade_no" TEXT NOT NULL,
  "openid" TEXT,
  "description" TEXT NOT NULL,
  "amount_fen" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "prepay_id" TEXT,
  "transaction_id" TEXT,
  "notify_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "notify_raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_orders_scene_token_key" ON "payment_orders"("scene_token");
CREATE UNIQUE INDEX "payment_orders_out_trade_no_key" ON "payment_orders"("out_trade_no");
CREATE INDEX "payment_orders_user_id_created_at_idx" ON "payment_orders"("user_id", "created_at");
CREATE INDEX "payment_orders_status_expires_at_idx" ON "payment_orders"("status", "expires_at");
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
