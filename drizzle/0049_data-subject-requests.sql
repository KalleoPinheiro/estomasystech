-- #293: pedidos do titular pelo portal (correção cadastral e eliminação/anonimização),
-- analisados pelo Admin de Empresa. `details` e `resolution` vão cifrados pela aplicação.
CREATE TABLE "data_subject_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"kind" text NOT NULL,
	"details" text,
	"status" text NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "data_subject_requests_kind_check" CHECK ("data_subject_requests"."kind" in ('correction', 'erasure')),
	CONSTRAINT "data_subject_requests_status_check" CHECK ("data_subject_requests"."status" in ('pending', 'accepted', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_data_subject_requests_clinic_status" ON "data_subject_requests" USING btree ("clinic_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_data_subject_requests_patient" ON "data_subject_requests" USING btree ("patient_id");