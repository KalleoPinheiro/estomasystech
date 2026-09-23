CREATE TABLE "commission_payout_items" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"payout_id" text NOT NULL,
	"professional_id" text NOT NULL,
	"appointment_id" text NOT NULL,
	"kind" text NOT NULL,
	"procedure" text NOT NULL,
	"session_date" timestamp with time zone NOT NULL,
	"base_cents" integer NOT NULL,
	"commission_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"professional_id" text NOT NULL,
	"period" text NOT NULL,
	"total_cents" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"payment_method" text NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "commission_type" text DEFAULT 'percentage' NOT NULL;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "commission_fixed_cents" integer;--> statement-breakpoint
ALTER TABLE "commission_payout_items" ADD CONSTRAINT "commission_payout_items_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payout_items" ADD CONSTRAINT "commission_payout_items_payout_id_commission_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."commission_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payout_items" ADD CONSTRAINT "commission_payout_items_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_payout_items_appointment" ON "commission_payout_items" USING btree ("appointment_id","kind");--> statement-breakpoint
CREATE INDEX "idx_commission_payout_items_payout" ON "commission_payout_items" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "idx_commission_payout_items_professional" ON "commission_payout_items" USING btree ("professional_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_payouts_period" ON "commission_payouts" USING btree ("clinic_id","professional_id","period");--> statement-breakpoint
CREATE INDEX "idx_commission_payouts_professional" ON "commission_payouts" USING btree ("professional_id");