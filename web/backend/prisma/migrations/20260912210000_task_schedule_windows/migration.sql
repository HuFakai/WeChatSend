ALTER TABLE "task_account_settings"
ADD COLUMN "reserved_start_at" TIMESTAMP(3),
ADD COLUMN "reserved_end_at" TIMESTAMP(3);

UPDATE "task_account_settings" AS settings
SET
  "reserved_start_at" = tasks."scheduled_at",
  "reserved_end_at" = tasks."scheduled_at" + make_interval(
    secs => settings."max_delay" * (
      SELECT COUNT(*)::INTEGER
      FROM "task_messages" AS messages
      WHERE messages."task_id" = settings."task_id"
        AND messages."account_id" = settings."account_id"
    )
  )
FROM "tasks" AS tasks
WHERE tasks."id" = settings."task_id";

ALTER TABLE "task_account_settings"
ALTER COLUMN "reserved_start_at" SET NOT NULL,
ALTER COLUMN "reserved_end_at" SET NOT NULL;

CREATE INDEX "task_account_schedule_window_idx"
ON "task_account_settings"("account_id", "reserved_start_at", "reserved_end_at");
