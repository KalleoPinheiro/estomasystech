-- Issue #194 (ADR-005): versão das sessões da conta. O token carrega `sv`;
-- logout, troca/reset de senha e desativação incrementam esta coluna e todo
-- token anterior passa a ser revogado no check do proxy. Tokens antigos (sem
-- `sv`) valem como versão 0 até o primeiro incremento.
ALTER TABLE "user_accounts" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;
