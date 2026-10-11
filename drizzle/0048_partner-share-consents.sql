-- #292: consentimento do paciente para o parceiro que o indicou ver dado
-- clínico no portal. Tabela nova e vazia: sem linha, o parceiro não vê
-- condições nem avaliações (falha fechado).
CREATE TABLE "partner_share_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"kind" text NOT NULL,
	"text_hash" text NOT NULL,
	"text_version" text,
	"actor" text NOT NULL,
	"ip_address" text,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "partner_share_consents_kind_check" CHECK ("partner_share_consents"."kind" IN ('accept', 'revoke')),
	CONSTRAINT "partner_share_consents_actor_check" CHECK ("partner_share_consents"."actor" IN ('patient', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "partner_share_consents" ADD CONSTRAINT "partner_share_consents_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_share_consents" ADD CONSTRAINT "partner_share_consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_share_consents" ADD CONSTRAINT "partner_share_consents_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_partner_share_consents_patient" ON "partner_share_consents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_partner_share_consents_partner" ON "partner_share_consents" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_partner_share_consents_clinic" ON "partner_share_consents" USING btree ("clinic_id");