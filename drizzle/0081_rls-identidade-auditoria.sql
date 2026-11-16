-- RLS lote de identidade e auditoria (#894, ADR-110): política clinic_isolation em user_accounts, google_accounts e audit_events.
-- O clinic_id das três é anulável (conta e evento de sistema, sem empresa): a linha sem empresa nunca casa com a política,
-- então só o papel de sistema (BYPASSRLS, DATABASE_SYSTEM_URL) a enxerga; o papel da aplicação vê só a empresa da transação.
-- Login, segundo fator, convite, recuperação de senha, OAuth sem sessão e auditoria pré-sessão já rodam em systemScope() (getSystemDb()).
-- Sem FORCE: o dono da tabela e o superusuário seguem ignorando a política (a produção de hoje conecta como dono). FORCE é a #874.
-- Rollback instantâneo, sem backup, por tabela: ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY; (só DROP POLICY deixa o RLS ligado sem política: o papel da aplicação passa a ver zero linhas; remover a política é limpeza opcional depois do DISABLE)
ALTER TABLE "user_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "user_accounts";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "user_accounts" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "google_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "google_accounts";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "google_accounts" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "audit_events";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "audit_events" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));
