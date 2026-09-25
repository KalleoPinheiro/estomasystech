DROP INDEX "uq_reminder_logs_daily";--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Linhas atuais são todas do canal automático (default 'email'). O recall
-- diário antigo gerou vários registros por retorno: numera as tentativas por
-- sent_on para caber no índice único; attempt >= 3 conta como esgotado.
UPDATE "reminder_logs" AS "rl"
SET "attempt" = "numbered"."attempt"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "reference_id" ORDER BY "sent_on", "created_at") AS "attempt"
  FROM "reminder_logs"
  WHERE "kind" = 'recall'
) AS "numbered"
WHERE "rl"."id" = "numbered"."id";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reminder_logs_recall_attempt" ON "reminder_logs" USING btree ("kind","reference_id","channel","attempt") WHERE "reminder_logs"."kind" = 'recall' and "reminder_logs"."channel" = 'email';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reminder_logs_daily" ON "reminder_logs" USING btree ("kind","reference_id","channel","sent_on") WHERE not ("reminder_logs"."kind" = 'recall' and "reminder_logs"."channel" = 'email');