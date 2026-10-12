-- #309 (ADR-012, ADR-005): o 2º fator virou obrigatório para o company_admin (#291),
-- mas as sessões abertas antes valiam até expirar (12 h). Subir o session_version dos
-- Admins ativos sem fator cadastrado derruba essas sessões; no próximo login eles
-- caem no cadastro do autenticador.
UPDATE "user_accounts"
SET "session_version" = "session_version" + 1
WHERE "role" = 'company_admin'
  AND NOT EXISTS (SELECT 1 FROM "user_mfa" WHERE "user_mfa"."account_id" = "user_accounts"."id");
