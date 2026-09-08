CREATE TYPE "MembershipGrantSource" AS ENUM ('WECHAT_VIRTUAL', 'ALIPAY');
CREATE TYPE "AlipayOrderStatus" AS ENUM ('PENDING', 'PAID', 'CLOSED', 'FAILED', 'REFUNDED');

CREATE TABLE "membership_grants" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "source" "MembershipGrantSource" NOT NULL,
  "source_order_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "quota_total" INTEGER NOT NULL DEFAULT 0,
  "quota_used" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "membership_grants_source_source_order_id_key" ON "membership_grants"("source", "source_order_id");
CREATE INDEX "membership_grants_user_id_expires_at_idx" ON "membership_grants"("user_id", "expires_at");
ALTER TABLE "membership_grants" ADD CONSTRAINT "membership_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_grants" ADD CONSTRAINT "membership_grants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "membership_grants" (
  "id", "user_id", "plan_id", "source", "source_order_id", "quantity", "quota_total", "quota_used", "starts_at", "expires_at", "created_at", "updated_at"
)
SELECT
  "id", "user_id", "plan_id", 'WECHAT_VIRTUAL'::"MembershipGrantSource", "order_id"::TEXT, "quantity", "quota_total", "quota_used", "starts_at", "expires_at", "created_at", "updated_at"
FROM "virtual_entitlements";

DROP TABLE "virtual_entitlements";

CREATE TABLE "alipay_orders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "out_trade_no" TEXT NOT NULL,
  "trade_no" TEXT,
  "subject" TEXT NOT NULL,
  "amount_fen" INTEGER NOT NULL,
  "status" "AlipayOrderStatus" NOT NULL DEFAULT 'PENDING',
  "qr_code" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "notify_at" TIMESTAMP(3),
  "notify_raw" JSONB,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alipay_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alipay_orders_out_trade_no_key" ON "alipay_orders"("out_trade_no");
CREATE UNIQUE INDEX "alipay_orders_trade_no_key" ON "alipay_orders"("trade_no");
CREATE INDEX "alipay_orders_user_id_created_at_idx" ON "alipay_orders"("user_id", "created_at");
CREATE INDEX "alipay_orders_status_expires_at_idx" ON "alipay_orders"("status", "expires_at");
ALTER TABLE "alipay_orders" ADD CONSTRAINT "alipay_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alipay_orders" ADD CONSTRAINT "alipay_orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
