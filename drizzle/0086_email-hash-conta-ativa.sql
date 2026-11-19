-- #909, ADR-111 (emenda): conta ativa sempre tem email_hash; só a anonimizada (anonymized_at preenchido) fica sem ele.
-- Aditiva em passos: NOT VALID adia a conferência das linhas existentes (não varre a tabela), mas o ALTER TABLE ainda pede
-- lock exclusivo por instantes e pode esperar transação aberta. As linhas existentes são conferidas depois, em migração
-- própria (VALIDATE CONSTRAINT), quando a conversão (data:reencrypt) estiver confirmada.
-- Precondição em produção: contagem ZERO de contas com anonymized_at IS NULL e email_hash IS NULL, inativas incluídas
-- (é o escopo da restrição; um UPDATE em linha assim passaria a falhar).
-- Reversão: ALTER TABLE "user_accounts" DROP CONSTRAINT "ck_user_accounts_email_hash_conta_ativa". O Drizzle segue
-- registrando a 0085 como aplicada: para restaurar a regra depois, conferir os dados e recriar a restrição por migração nova.
ALTER TABLE "user_accounts" ADD CONSTRAINT "ck_user_accounts_email_hash_conta_ativa" CHECK ("user_accounts"."anonymized_at" IS NOT NULL OR "user_accounts"."email_hash" IS NOT NULL) NOT VALID;
