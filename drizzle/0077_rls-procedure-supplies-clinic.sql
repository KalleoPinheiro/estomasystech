-- RLS etapa 4 (#873, ADR-110), lote 0: procedure_supplies ganha clinic_id para a política por igualdade simples;
-- as quatro tabelas sem índice líder em clinic_id (agenda e financeiro) ganham um, que o predicado da política usa.
-- Expandir: coluna nula, preenchida a partir do procedimento (pai). Contrair: NOT NULL depois do preenchimento.
-- Integridade com o pai no banco: chave composta (procedure_id, clinic_id) -> procedures (id, clinic_id).
-- Código anterior ao deploy segue funcionando: o gatilho completa clinic_id no INSERT quando ele vem nulo.
-- Rollback: o RLS desta tabela se desliga na 0078 (ALTER TABLE procedure_supplies DISABLE ROW LEVEL SECURITY); a coluna e o gatilho podem ficar.
ALTER TABLE "procedure_supplies" ADD COLUMN "clinic_id" text;--> statement-breakpoint
UPDATE "procedure_supplies" AS ps SET "clinic_id" = p."clinic_id" FROM "procedures" AS p WHERE p."id" = ps."procedure_id" AND ps."clinic_id" IS NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION procedure_supplies_fill_clinic() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT p.clinic_id INTO NEW.clinic_id FROM procedures p WHERE p.id = NEW.procedure_id;
  END IF;
  RETURN NEW;
END
$fn$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "procedure_supplies_fill_clinic" ON "procedure_supplies";--> statement-breakpoint
CREATE TRIGGER "procedure_supplies_fill_clinic" BEFORE INSERT ON "procedure_supplies" FOR EACH ROW EXECUTE FUNCTION procedure_supplies_fill_clinic();--> statement-breakpoint
ALTER TABLE "procedure_supplies" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_procedures_id_clinic" ON "procedures" USING btree ("id","clinic_id");--> statement-breakpoint
ALTER TABLE "procedure_supplies" ADD CONSTRAINT "fk_procedure_supplies_procedure_clinic" FOREIGN KEY ("procedure_id","clinic_id") REFERENCES "public"."procedures"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_procedure_supplies_clinic" ON "procedure_supplies" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_professional_availability_clinic" ON "professional_availability" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_invoice_payments_clinic" ON "invoice_payments" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_payouts_clinic" ON "commission_payouts" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_payout_items_clinic" ON "commission_payout_items" USING btree ("clinic_id");
