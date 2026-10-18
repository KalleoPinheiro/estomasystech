ALTER TABLE "consent_records" ADD COLUMN "signer_guardian_id" text;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "signer_relationship" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "majority_reviewed_at" timestamp with time zone;