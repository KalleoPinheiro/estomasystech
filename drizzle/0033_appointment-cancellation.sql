ALTER TABLE "appointments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancel_reason" text;