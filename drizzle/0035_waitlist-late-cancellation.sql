CREATE TABLE "waitlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"procedure_id" text,
	"professional_id" text,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"notes" text,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_settings" ADD COLUMN "cancel_notice_hours" integer;--> statement-breakpoint
ALTER TABLE "schedule_settings" ADD COLUMN "late_cancel_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_waitlist_entries_clinic_status" ON "waitlist_entries" USING btree ("clinic_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_waitlist_entries_patient" ON "waitlist_entries" USING btree ("patient_id");