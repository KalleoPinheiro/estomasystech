-- Catálogo de diagnósticos da clínica (#954): a clínica cadastra os diagnósticos de enfermagem que usa, um a um ou por CSV.
-- Tabela nova com a política clinic_isolation e FORCE, como as outras 45 (ADR-110). No plano de cuidados, o código passa a
-- aceitar nulo (diagnóstico digitado à mão, "sem código") e entra o título cifrado gravado no plano. O código antigo só lê
-- linhas com código e ignora a coluna nova.
-- Desfazer: DROP TABLE "clinic_nursing_diagnoses"; ALTER TABLE "care_plan_diagnoses" DROP COLUMN "diagnosis_label";
-- (o SET NOT NULL de "diagnosis_code" só volta depois de remover as linhas sem código).
CREATE TABLE "clinic_nursing_diagnoses" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"code" text,
	"label" text NOT NULL,
	"domain" text,
	"class" text,
	"edition" text,
	"definition" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_plan_diagnoses" ALTER COLUMN "diagnosis_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "care_plan_diagnoses" ADD COLUMN "diagnosis_label" text;--> statement-breakpoint
ALTER TABLE "clinic_nursing_diagnoses" ADD CONSTRAINT "clinic_nursing_diagnoses_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clinic_nursing_diagnoses_clinic_label" ON "clinic_nursing_diagnoses" USING btree ("clinic_id","label");--> statement-breakpoint
ALTER TABLE "clinic_nursing_diagnoses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "clinic_nursing_diagnoses" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "clinic_nursing_diagnoses" FORCE ROW LEVEL SECURITY;
