-- #909, ADR-111 (emenda): conta ativa sempre tem email_hash; só a anonimizada (anonymized_at preenchido) fica sem ele.
-- Aditiva e em passos seguros: NOT VALID vale para toda escrita nova sem varrer nem bloquear a tabela. As linhas existentes
-- são conferidas depois, em migração própria (VALIDATE CONSTRAINT), quando a conversão (data:reencrypt) estiver confirmada.
-- Precondição em produção: nenhuma conta ativa sem hash (a conversão da v0.8.0 foi conferida por prod-verifica-integridade).
-- Rollback instantâneo: ALTER TABLE "user_accounts" DROP CONSTRAINT "ck_user_accounts_email_hash_conta_ativa";
ALTER TABLE "user_accounts" ADD CONSTRAINT "ck_user_accounts_email_hash_conta_ativa" CHECK ("user_accounts"."anonymized_at" IS NOT NULL OR "user_accounts"."email_hash" IS NOT NULL) NOT VALID;
