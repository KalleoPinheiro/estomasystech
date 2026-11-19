-- Relatório mensal ao parceiro (RM-15, ADR-114). Coluna nova e nula: o código antigo ignora.
-- Desfazer: ALTER TABLE "partners" DROP COLUMN "monthly_report_month";
ALTER TABLE "partners" ADD COLUMN "monthly_report_month" text;
