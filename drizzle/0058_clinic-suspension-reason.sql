ALTER TABLE "clinics" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "status_reason_note" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_status_reason_check" CHECK ("clinics"."status_reason" IS NULL OR "clinics"."status_reason" IN ('non_payment', 'clinic_request', 'security_incident', 'other'));