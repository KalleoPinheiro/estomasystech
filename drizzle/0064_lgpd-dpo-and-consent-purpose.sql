ALTER TABLE "clinics" ADD COLUMN "dpo_name" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "dpo_contact" text;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "purpose" text DEFAULT 'treatment' NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "controller_snapshot" text;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_purpose_check" CHECK ("consent_records"."purpose" IN ('treatment', 'image'));