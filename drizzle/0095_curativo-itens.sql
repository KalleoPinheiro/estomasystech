-- Itens usados no curativo (#963, T2): insumo e quantidade por etapa. Sem texto clínico, sem cifra.
-- Tabela nova com a política clinic_isolation e FORCE, como as outras (ADR-110). Aditiva: o código antigo não a lê.
-- Desfazer: DROP TABLE "dressing_record_items";
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
ALTER TABLE "dressing_record_items" ADD CONSTRAINT "dressing_record_items_dressing_record_id_dressing_records_id_fk" FOREIGN KEY ("dressing_record_id") REFERENCES "public"."dressing_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dressing_record_items" ADD CONSTRAINT "dressing_record_items_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dressing_record_items_record" ON "dressing_record_items" USING btree ("dressing_record_id","position");--> statement-breakpoint
CREATE INDEX "idx_dressing_record_items_supply" ON "dressing_record_items" USING btree ("supply_id");--> statement-breakpoint
ALTER TABLE "dressing_record_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clinic_isolation" ON "dressing_record_items" USING ("clinic_id" = current_setting('app.clinic_id', true)) WITH CHECK ("clinic_id" = current_setting('app.clinic_id', true));--> statement-breakpoint
ALTER TABLE "dressing_record_items" FORCE ROW LEVEL SECURITY;
