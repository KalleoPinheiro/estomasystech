CREATE TABLE "invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_payments_invoice" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
-- Faturas já pagas ganham o recebimento equivalente (valor cheio, forma e data
-- registradas na fatura), para o total recebido e o recibo valerem também
-- para o histórico.
INSERT INTO "invoice_payments" ("id", "clinic_id", "invoice_id", "amount_cents", "method", "paid_at")
SELECT 'legacy-' || "id", "clinic_id", "id", "amount_cents", COALESCE("payment_method", 'cash'), COALESCE("paid_at", "issued_at")
FROM "invoices"
WHERE "status" = 'paid';
