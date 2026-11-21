-- Cliente autônoma com CPF (#977, ADR-096). Colunas novas: `kind` nasce `company` em toda linha
-- existente; `cpf` (cifrado) e `cpf_hash` (índice cego) nascem nulos. O código antigo ignora as três.
-- Desfazer: DROP INDEX "uq_clinics_cpf_hash"; ALTER TABLE "clinics" DROP CONSTRAINT "clinics_kind_check";
--           ALTER TABLE "clinics" DROP COLUMN "cpf_hash", DROP COLUMN "cpf", DROP COLUMN "kind";
ALTER TABLE "clinics" ADD COLUMN "kind" text DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "cpf_hash" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_kind_check" CHECK ("clinics"."kind" IN ('company', 'individual'));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clinics_cpf_hash" ON "clinics" USING btree ("cpf_hash") WHERE "clinics"."cpf_hash" IS NOT NULL;
