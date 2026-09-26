-- Issue #196: a conta de portal passa a apontar para o cadastro (FK) em vez
-- de ser casada pelo e-mail, que a recepção pode corrigir ou reaproveitar.
ALTER TABLE "user_accounts" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD COLUMN "partner_id" text;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_accounts_clinic_patient" ON "user_accounts" USING btree ("clinic_id","patient_id") WHERE "user_accounts"."patient_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_accounts_clinic_partner" ON "user_accounts" USING btree ("clinic_id","partner_id") WHERE "user_accounts"."partner_id" IS NOT NULL;--> statement-breakpoint
-- Vínculo das contas existentes pelo e-mail atual, na mesma empresa. Conta que
-- não casa fica órfã (sem acesso ao portal) e aparece em `npm run db:portal-orphans`.
UPDATE "user_accounts" AS ua SET "patient_id" = p."id"
  FROM "patients" AS p
  WHERE ua."role" = 'patient' AND ua."patient_id" IS NULL
    AND p."clinic_id" = ua."clinic_id" AND lower(p."email") = lower(ua."email");--> statement-breakpoint
UPDATE "user_accounts" AS ua SET "partner_id" = pa."id"
  FROM "partners" AS pa
  WHERE ua."role" = 'partner' AND ua."partner_id" IS NULL
    AND pa."clinic_id" = ua."clinic_id" AND lower(pa."email") = lower(ua."email");
