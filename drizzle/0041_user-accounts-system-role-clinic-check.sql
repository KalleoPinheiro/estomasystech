-- B1 (#214, ADR-007): só o super_admin fica sem clínica, e ele nunca tem
-- clínica. Com `uq_user_accounts_single_system_account`, existe no máximo um
-- super_admin. Sem saneamento: se o banco já tem linha que viola a regra, a
-- migração falha e nada muda (decisão do dono, 2026-09-27).
ALTER TABLE "user_accounts" ADD CONSTRAINT "ck_user_accounts_system_role_has_no_clinic" CHECK (("user_accounts"."role" = 'super_admin') = ("user_accounts"."clinic_id" IS NULL));
