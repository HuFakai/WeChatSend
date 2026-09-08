ALTER TABLE "users" ADD COLUMN "email" TEXT, ADD COLUMN "email_verified_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE TABLE "auth_challenges" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "secret_hash" TEXT NOT NULL,
 "subject" TEXT NOT NULL, "user_id" TEXT, "approved_id" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0, "consumed_at" TIMESTAMP(3),
 "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "auth_challenges_subject_kind_created_at_idx" ON "auth_challenges"("subject", "kind", "created_at");
CREATE INDEX "auth_challenges_expires_at_idx" ON "auth_challenges"("expires_at");
CREATE TABLE "alipay_configs" (
 "id" TEXT PRIMARY KEY DEFAULT 'default', "app_id" TEXT NOT NULL, "gateway" TEXT NOT NULL,
 "encrypted_private_key" TEXT NOT NULL, "public_key" TEXT NOT NULL, "seller_id" TEXT NOT NULL,
 "notify_url" TEXT NOT NULL, "key_type" TEXT NOT NULL DEFAULT 'PKCS1',
 "expire_minutes" INTEGER NOT NULL DEFAULT 30, "enabled" BOOLEAN NOT NULL DEFAULT false, "updated_at" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "alipay_orders" ADD COLUMN "membership_days" INTEGER, ADD COLUMN "message_quota" INTEGER,
 ADD COLUMN "encrypted_config" TEXT, ADD COLUMN "queried_at" TIMESTAMP(3);
ALTER TABLE "virtual_payment_orders" ADD COLUMN "membership_days" INTEGER, ADD COLUMN "message_quota" INTEGER;
UPDATE "alipay_orders" o SET "membership_days"=p.membership_days,"message_quota"=p.message_quota FROM "membership_plans" p WHERE o.plan_id=p.id;
UPDATE "virtual_payment_orders" o SET "membership_days"=p.membership_days,"message_quota"=p.message_quota FROM "membership_plans" p WHERE o.plan_id=p.id;
CREATE TABLE "membership_usages" (
 "id" UUID PRIMARY KEY, "user_id" UUID NOT NULL, "grant_id" UUID NOT NULL, "task_id" UUID NOT NULL,
 "amount" INTEGER NOT NULL, "refunded" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "membership_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
 CONSTRAINT "membership_usages_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "membership_grants"("id") ON DELETE CASCADE,
 CONSTRAINT "membership_usages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "membership_usages_task_id_grant_id_key" ON "membership_usages"("task_id","grant_id");
CREATE INDEX "membership_usages_user_id_created_at_idx" ON "membership_usages"("user_id","created_at");
