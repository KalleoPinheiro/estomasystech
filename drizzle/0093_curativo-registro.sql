-- Registro do curativo em etapas (#963, T1): as etapas vão cifradas num JSON só (`content`), como o receituário (ADR-116).
-- Tabela nova com a política clinic_isolation e FORCE, como as outras (ADR-110). Aditiva: o código antigo não a lê.
-- Desfazer: DROP TABLE "dressing_records";
CREATE TABLE "dressing_records" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"appointment_id" text NOT NULL,
	"condition_id" text,
	"professional_id" text,
	"content" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dressing_records" ADD CONSTRAINT "dressing_records_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_records" ADD CONSTRAINT "dressing_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_records" ADD CONSTRAINT "dressing_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_records" ADD CONSTRAINT "dressing_records_condition_id_clinical_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."clinical_conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_records" ADD CONSTRAINT "dressing_records_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dressing_records_appointment" ON "dressing_records" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "idx_dressing_records_patient" ON "dressing_records" USING btree ("clinic_id","patient_id","created_at");--> statement-breakpoint
ALTER TABLE "dressing_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "dressing_records" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "dressing_records" FORCE ROW LEVEL SECURITY;
