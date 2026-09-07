-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENDING', 'ACCEPTED', 'RETRY_WAIT', 'FAILED', 'UNKNOWN', 'NEEDS_REVIEW', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'ACCEPTED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_accounts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'WeChatSend',
    "min_delay" INTEGER NOT NULL DEFAULT 5,
    "max_delay" INTEGER NOT NULL DEFAULT 8,
    "email_verified_at" TIMESTAMP(3),
    "verification_hash" TEXT,
    "verification_until" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friends" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "remark" TEXT NOT NULL,
    "remark_key" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'SCHEDULED',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_account_settings" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "config_version" INTEGER NOT NULL,
    "min_delay" INTEGER NOT NULL,
    "max_delay" INTEGER NOT NULL,

    CONSTRAINT "task_account_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_messages" (
    "id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "task_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "friend_id" UUID NOT NULL,
    "friend_remark" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "min_delay" INTEGER NOT NULL,
    "max_delay" INTEGER NOT NULL,
    "config_version" INTEGER NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "ready_at" TIMESTAMP(3) NOT NULL,
    "dispatch_reserved_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_dispatch_states" (
    "account_id" UUID NOT NULL,
    "next_allowed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_dispatch_states_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "wechat_accounts_owner_id_status_idx" ON "wechat_accounts"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_accounts_owner_id_recipient_email_key" ON "wechat_accounts"("owner_id", "recipient_email");

-- CreateIndex
CREATE INDEX "friends_owner_id_account_id_status_idx" ON "friends"("owner_id", "account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friends_account_id_remark_key_key" ON "friends"("account_id", "remark_key");

-- CreateIndex
CREATE INDEX "tasks_owner_id_created_at_idx" ON "tasks"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_owner_id_idempotency_key_key" ON "tasks"("owner_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "task_account_settings_task_id_account_id_key" ON "task_account_settings"("task_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_messages_message_id_key" ON "task_messages"("message_id");

-- CreateIndex
CREATE INDEX "task_messages_account_id_status_ready_at_idx" ON "task_messages"("account_id", "status", "ready_at");

-- CreateIndex
CREATE INDEX "task_messages_task_id_status_idx" ON "task_messages"("task_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_messages_task_id_account_id_friend_id_key" ON "task_messages"("task_id", "account_id", "friend_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_message_id_sequence_key" ON "delivery_attempts"("message_id", "sequence");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_created_at_idx" ON "outbox_events"("processed_at", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_accounts" ADD CONSTRAINT "wechat_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friends" ADD CONSTRAINT "friends_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wechat_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_account_settings" ADD CONSTRAINT "task_account_settings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_account_settings" ADD CONSTRAINT "task_account_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wechat_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wechat_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "friends"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "task_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_dispatch_states" ADD CONSTRAINT "account_dispatch_states_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wechat_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
