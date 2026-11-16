-- RLS etapa 4 (#873, ADR-110), lote financeiro (pacotes, faturas, repasses): política clinic_isolation em 6 tabelas.
-- Sem FORCE: o dono da tabela e o superusuário seguem ignorando a política (a produção de hoje conecta como dono).
-- Só o papel da aplicação (não dono, sem BYPASSRLS) é filtrado. Sem app.clinic_id na transação não há linha (falha fechado).
-- Rollback instantâneo, sem backup, por tabela: ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY; (só DROP POLICY deixa o RLS ligado sem política: o papel da aplicação passa a ver zero linhas; remover a política é limpeza opcional depois do DISABLE)
ALTER TABLE "session_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "session_packages";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "session_packages" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "package_consumptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "package_consumptions";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "package_consumptions" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "invoices";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "invoices" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "invoice_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "invoice_payments";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "invoice_payments" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "commission_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "commission_payouts";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "commission_payouts" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "commission_payout_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "commission_payout_items";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "commission_payout_items" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));
