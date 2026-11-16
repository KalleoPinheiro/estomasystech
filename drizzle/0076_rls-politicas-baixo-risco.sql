-- RLS etapa 3 (#872, ADR-110): política tenant_isolation em supplies, partners e schedule_closures.
-- Sem FORCE: o dono da tabela e o superusuário seguem ignorando a política (a produção de hoje conecta como dono).
-- Só o papel da aplicação (não dono, sem BYPASSRLS) é filtrado. Sem app.clinic_id na transação não há linha (falha fechado).
-- Rollback instantâneo, sem backup: ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY; (ou DROP POLICY tenant_isolation ON <tabela>;)
ALTER TABLE "supplies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "supplies";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "supplies" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "partners";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "partners" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "schedule_closures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "schedule_closures";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "schedule_closures" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));
