-- RLS etapa 5, parte 1 (#874, ADR-110): política clinic_isolation nas quatro tabelas sem clinic_id.
-- clinics: a linha é visível só quando o id é o da clínica da transação (app.clinic_id).
-- auth_tokens, user_mfa e mfa_recovery_codes: herdam da conta. EXISTS sobre user_accounts, que tem a própria política
-- clinic_isolation (0081): a conta de outra clínica, ou sem clínica (super_admin), não é visível ao papel da aplicação.
-- Antes da sessão (login, convite, recuperação de senha, segundo fator, plataforma) tudo roda em systemScope(): papel BYPASSRLS.
-- Sem FORCE nesta migração: o dono da tabela e o superusuário seguem ignorando a política até a 0083.
-- Rollback instantâneo, sem backup, por tabela: ALTER TABLE <tabela> DISABLE ROW LEVEL SECURITY; (só DROP POLICY deixa o RLS ligado sem política: o papel da aplicação passa a ver zero linhas)
ALTER TABLE "clinics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "clinics";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "clinics" USING ("id" = current_setting('app.clinic_id', true)) WITH CHECK ("id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "auth_tokens";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "auth_tokens" USING (EXISTS (SELECT 1 FROM "user_accounts" ua WHERE ua."id" = "auth_tokens"."account_id")) WITH CHECK (EXISTS (SELECT 1 FROM "user_accounts" ua WHERE ua."id" = "auth_tokens"."account_id"));--> statement-breakpoint
ALTER TABLE "user_mfa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "user_mfa";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "user_mfa" USING (EXISTS (SELECT 1 FROM "user_accounts" ua WHERE ua."id" = "user_mfa"."account_id")) WITH CHECK (EXISTS (SELECT 1 FROM "user_accounts" ua WHERE ua."id" = "user_mfa"."account_id"));--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "clinic_isolation" ON "mfa_recovery_codes";--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "mfa_recovery_codes" USING (EXISTS (SELECT 1 FROM "user_accounts" ua WHERE ua."id" = "mfa_recovery_codes"."account_id")) WITH CHECK (EXISTS (SELECT 1 FROM "user_accounts" ua WHERE ua."id" = "mfa_recovery_codes"."account_id"));
