-- Receituário de enfermagem emitido (#956, ADR-116): o conteúdo impresso é congelado na emissão, cifrado num JSON só.
-- Tabela nova com a política clinic_isolation e FORCE, como as outras (ADR-110). Aditiva: o código antigo não a lê.
-- Desfazer: DROP TABLE "nursing_prescriptions";
CREATE TABLE "nursing_prescriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"care_plan_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"issued_by" text NOT NULL,
	"content" text,
	"issued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nursing_prescriptions" ADD CONSTRAINT "nursing_prescriptions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursing_prescriptions" ADD CONSTRAINT "nursing_prescriptions_care_plan_id_care_plans_id_fk" FOREIGN KEY ("care_plan_id") REFERENCES "public"."care_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursing_prescriptions" ADD CONSTRAINT "nursing_prescriptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_nursing_prescriptions_plan" ON "nursing_prescriptions" USING btree ("care_plan_id","issued_at");--> statement-breakpoint
CREATE INDEX "idx_nursing_prescriptions_patient" ON "nursing_prescriptions" USING btree ("clinic_id","patient_id");--> statement-breakpoint
ALTER TABLE "nursing_prescriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "nursing_prescriptions" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "nursing_prescriptions" FORCE ROW LEVEL SECURITY;
