-- Contração do e-mail de login cifrado (ADR-111 § 5, emenda do ADR-114, #909). Não aditiva: classe 3.
-- 1. Confere as linhas existentes contra a restrição da 0086 (conta ativa sempre tem email_hash). Varre a tabela com
--    SHARE UPDATE EXCLUSIVE: leitura e escrita seguem durante a conferência.
-- 2. Remove os dois índices únicos sobre o `email` em claro. O `email` é cifra não determinística (nunca repete), então
--    eles já não garantiam nada; a unicidade é dos índices sobre `email_hash` (0074).
-- Precondição em produção (o dono confere antes do deploy, prod-verifica-integridade): `sem indice cego=0` na linha
-- cifra_email_login. Se não for zero, rodar `npm run data:reencrypt` antes. Se faltar, o VALIDATE falha, a transação
-- da migração volta inteira e o Release deploy para antes de trocar a imagem (ADR-113).
-- Reversão: redeploy da tag anterior funciona sem estes índices (o código anterior grava sempre cifra e hash). Para
-- recriá-los, se preciso: CREATE UNIQUE INDEX "uq_user_accounts_clinic_email" ON "user_accounts" ("clinic_id","email");
-- CREATE UNIQUE INDEX "uq_user_accounts_super_admin_email" ON "user_accounts" ("email") WHERE "clinic_id" IS NULL;
ALTER TABLE "user_accounts" VALIDATE CONSTRAINT "ck_user_accounts_email_hash_conta_ativa";--> statement-breakpoint
DROP INDEX "uq_user_accounts_clinic_email";--> statement-breakpoint
DROP INDEX "uq_user_accounts_super_admin_email";
