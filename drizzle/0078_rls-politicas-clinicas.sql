-- RLS etapa 4 (#873, ADR-110), lote clínico e operacional (agenda, prontuário, plano de cuidado, estoque, comunicação): política clinic_isolation em 29 tabelas.
-- Sem FORCE: o dono da tabela e o superusuário seguem ignorando a política (a produção de hoje conecta como dono).
-- Só o papel da aplicação (não dono, sem BYPASSRLS) é filtrado. Sem app.clinic_id na transação não há linha (falha fechado).
-- Rollback instantâneo, sem backup, por tabela: ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY; (só DROP POLICY deixa o RLS ligado sem política: o papel da aplicação passa a ver zero linhas; remover a política é limpeza opcional depois do DISABLE)
ALTER TABLE "professionals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "professionals";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "professionals" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "procedures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "procedures";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "procedures" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "procedure_supplies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "procedure_supplies";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "procedure_supplies" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "schedule_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "schedule_settings";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "schedule_settings" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "professional_availability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "professional_availability";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "professional_availability" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "waitlist_entries";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "waitlist_entries" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "guardians";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "guardians" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "patients";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "patients" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "appointments";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "appointments" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "anamneses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "anamneses";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "anamneses" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "evolution_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "evolution_notes";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "evolution_notes" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "clinical_conditions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "clinical_conditions";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "clinical_conditions" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "condition_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "condition_assessments";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "condition_assessments" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "condition_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "condition_photos";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "condition_photos" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "consent_records";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "consent_records" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "partner_share_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "partner_share_consents";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "partner_share_consents" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "data_subject_requests";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "data_subject_requests" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "supply_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "supply_batches";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "supply_batches" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "stock_movements";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "stock_movements" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "follow_ups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "follow_ups";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "follow_ups" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "reminder_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "reminder_logs";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "reminder_logs" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "care_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "care_plans";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "care_plans" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "care_plan_diagnoses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "care_plan_diagnoses";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "care_plan_diagnoses" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "care_plan_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "care_plan_outcomes";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "care_plan_outcomes" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "care_plan_interventions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "care_plan_interventions";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "care_plan_interventions" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "outcome_evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "outcome_evaluations";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "outcome_evaluations" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "intervention_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "intervention_records";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "intervention_records" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "professional_patient_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "professional_patient_links";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "professional_patient_links" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "clinic_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "clinic_channels";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "clinic_channels" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));
