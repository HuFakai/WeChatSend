-- A TASK_ID in an email now identifies one TaskMessage and acts as the callback key.
CREATE TYPE "FeedbackStatus" AS ENUM ('SUCCESS', 'FAILED');

ALTER TABLE "task_messages"
  ADD COLUMN "feedback_status" "FeedbackStatus",
  ADD COLUMN "feedback_received_at" TIMESTAMP(3),
  ADD COLUMN "feedback_error" TEXT;

ALTER TABLE "account_dispatch_states"
  ADD COLUMN "locked_message_id" UUID,
  ADD COLUMN "locked_until" TIMESTAMP(3);

ALTER TABLE "wechat_accounts"
  ALTER COLUMN "min_delay" SET DEFAULT 10,
  ALTER COLUMN "max_delay" SET DEFAULT 15;

-- Existing 5-8 second configurations are no longer valid. Preserve larger values and
-- lift older values to the new safe floor.
UPDATE "wechat_accounts"
SET
  "min_delay" = GREATEST("min_delay", 10),
  "max_delay" = GREATEST("max_delay", 10),
  "config_version" = "config_version" + 1
WHERE "min_delay" < 10 OR "max_delay" < 10;

-- Old reservations belonged to the previous pre-allocation scheduler.
UPDATE "task_messages" SET "dispatch_reserved_at" = NULL;
