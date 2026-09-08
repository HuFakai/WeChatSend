CREATE TYPE "VirtualMessageMode" AS ENUM ('PLAINTEXT', 'COMPATIBLE', 'SECURE');
CREATE TYPE "VirtualDataFormat" AS ENUM ('XML', 'JSON');
CREATE TYPE "VirtualPaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'DELIVERED', 'FAILED', 'CLOSED', 'REFUNDED');

ALTER TABLE "users"
  ADD COLUMN "mini_session_key_encrypted" TEXT;

CREATE TABLE "virtual_payment_configs" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "app_id" TEXT NOT NULL,
  "offer_id" TEXT NOT NULL,
  "encrypted_app_key" TEXT NOT NULL,
  "push_token" TEXT NOT NULL,
  "encrypted_encoding_aes_key" TEXT,
  "message_mode" "VirtualMessageMode" NOT NULL DEFAULT 'PLAINTEXT',
  "data_format" "VirtualDataFormat" NOT NULL DEFAULT 'XML',
  "env" INTEGER NOT NULL DEFAULT 0,
  "notify_url" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "virtual_payment_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_plans" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price_fen" INTEGER NOT NULL,
  "membership_days" INTEGER NOT NULL DEFAULT 30,
  "message_quota" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "membership_plans_code_key" ON "membership_plans"("code");
CREATE INDEX "membership_plans_is_active_sort_order_idx" ON "membership_plans"("is_active", "sort_order");

CREATE TABLE "virtual_payment_orders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "out_trade_no" TEXT NOT NULL,
  "wx_order_id" TEXT,
  "openid" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "amount_fen" INTEGER NOT NULL,
  "attach" TEXT NOT NULL,
  "status" "VirtualPaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "queried_at" TIMESTAMP(3),
  "notify_raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "virtual_payment_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "virtual_payment_orders_out_trade_no_key" ON "virtual_payment_orders"("out_trade_no");
CREATE UNIQUE INDEX "virtual_payment_orders_wx_order_id_key" ON "virtual_payment_orders"("wx_order_id");
CREATE INDEX "virtual_payment_orders_user_id_created_at_idx" ON "virtual_payment_orders"("user_id", "created_at");
CREATE INDEX "virtual_payment_orders_status_expires_at_idx" ON "virtual_payment_orders"("status", "expires_at");
CREATE INDEX "virtual_payment_orders_openid_status_idx" ON "virtual_payment_orders"("openid", "status");
ALTER TABLE "virtual_payment_orders" ADD CONSTRAINT "virtual_payment_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "virtual_payment_orders" ADD CONSTRAINT "virtual_payment_orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "virtual_entitlements" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "quota_total" INTEGER NOT NULL DEFAULT 0,
  "quota_used" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "virtual_entitlements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "virtual_entitlements_order_id_key" ON "virtual_entitlements"("order_id");
CREATE INDEX "virtual_entitlements_user_id_expires_at_idx" ON "virtual_entitlements"("user_id", "expires_at");
ALTER TABLE "virtual_entitlements" ADD CONSTRAINT "virtual_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "virtual_entitlements" ADD CONSTRAINT "virtual_entitlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "virtual_payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "virtual_entitlements" ADD CONSTRAINT "virtual_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
