DROP INDEX "uq_commission_payout_items_appointment";--> statement-breakpoint
DROP INDEX "uq_commission_payouts_period";--> statement-breakpoint
ALTER TABLE "commission_payout_items" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD COLUMN "rule_kind" text;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD COLUMN "rule_value" integer;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_payout_items_active_appointment" ON "commission_payout_items" USING btree ("appointment_id","kind") WHERE "commission_payout_items"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_payouts_active_period" ON "commission_payouts" USING btree ("clinic_id","professional_id","period") WHERE "commission_payouts"."status" = 'active';