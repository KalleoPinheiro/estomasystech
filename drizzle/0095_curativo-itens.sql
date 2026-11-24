-- Itens usados no curativo (#963, T2): insumo e quantidade por etapa. Sem texto clínico, sem cifra.
-- Chaves compostas com a empresa (id, clinic_id): o item nunca aponta para curativo ou insumo de outra empresa,
-- porque a FK do Postgres não passa pela RLS. Os índices únicos vêm antes das FKs que dependem deles.
-- Tabela nova com a política clinic_isolation e FORCE, como as outras (ADR-110). Aditiva: o código antigo não a lê.
-- Desfazer: DROP TABLE "dressing_record_items"; DROP INDEX "uq_dressing_records_id_clinic"; DROP INDEX "uq_supplies_id_clinic";
CREATE UNIQUE INDEX "uq_dressing_records_id_clinic" ON "dressing_records" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplies_id_clinic" ON "supplies" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE TABLE "dressing_record_items" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"dressing_record_id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"supply_id" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dressing_record_items" ADD CONSTRAINT "dressing_record_items_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_record_items" ADD CONSTRAINT "fk_dressing_record_items_record_clinic" FOREIGN KEY ("dressing_record_id","clinic_id") REFERENCES "public"."dressing_records"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_record_items" ADD CONSTRAINT "fk_dressing_record_items_supply_clinic" FOREIGN KEY ("supply_id","clinic_id") REFERENCES "public"."supplies"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dressing_record_items_record" ON "dressing_record_items" USING btree ("dressing_record_id","position");--> statement-breakpoint
CREATE INDEX "idx_dressing_record_items_supply" ON "dressing_record_items" USING btree ("supply_id");--> statement-breakpoint
ALTER TABLE "dressing_record_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "dressing_record_items" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "dressing_record_items" FORCE ROW LEVEL SECURITY;
