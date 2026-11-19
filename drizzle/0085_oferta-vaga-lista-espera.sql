-- Oferta de vaga da lista de espera (RM-16, ADR-114). Colunas novas na tabela que já tem RLS: o código antigo ignora.
-- Desfazer: DROP INDEX "uq_waitlist_open_offer"; depois DROP COLUMN das quatro colunas abaixo.
ALTER TABLE "waitlist_entries" ADD COLUMN "offer_appointment_id" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "offer_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "offer_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "offered_appointment_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_offer_appointment_id_appointments_id_fk" FOREIGN KEY ("offer_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_waitlist_open_offer" ON "waitlist_entries" USING btree ("offer_appointment_id") WHERE "waitlist_entries"."offer_appointment_id" IS NOT NULL;