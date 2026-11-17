-- RLS etapa 5, parte 2 (#874, ADR-110): FORCE ROW LEVEL SECURITY nas 45 tabelas com a política clinic_isolation.
-- Com FORCE a política vale também para o DONO da tabela (só superusuário e BYPASSRLS a ignoram). Daqui em diante, conexão
-- sem app.clinic_id enxerga zero linhas: aplicação em DATABASE_URL (papel da aplicação ou dono) e sistema em DATABASE_SYSTEM_URL (BYPASSRLS).
-- ATENÇÃO NO DEPLOY (producao.md § 4.7): antes de aplicar, a DATABASE_URL já deve estar no papel da aplicação, a DATABASE_SYSTEM_URL
-- definida e o usuário do backup deve ser superusuário ou BYPASSRLS. Se a aplicação ainda conecta como dono comum, ela passa a ver zero linhas.
-- Idempotente (FORCE repetido não muda nada) e sem tocar em dado.
-- Rollback instantâneo, sem backup, por tabela: ALTER TABLE <tabela> NO FORCE ROW LEVEL SECURITY; (a política e o RLS ficam ligados)
ALTER TABLE "anamneses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "care_plan_diagnoses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "care_plan_interventions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "care_plan_outcomes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "care_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinic_channels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinical_conditions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clinics" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commission_payout_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commission_payouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "condition_assessments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "condition_photos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consent_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_subject_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evolution_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "follow_ups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "google_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardians" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intervention_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outcome_evaluations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "package_consumptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_share_consents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partners" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "procedure_supplies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "procedures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "professional_availability" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "professional_patient_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "professionals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedule_closures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedule_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session_packages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supply_batches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_mfa" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist_entries" FORCE ROW LEVEL SECURITY;
