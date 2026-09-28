-- B7 (#211, #214): e-mail do parceiro único por empresa, não no banco inteiro
-- (como uq_patients_clinic_email). Sem saneamento: (clinic_id, email) é
-- estritamente mais fraca que email global, nenhuma linha existente a viola.
ALTER TABLE "partners" DROP CONSTRAINT "partners_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_partners_clinic_email" ON "partners" USING btree ("clinic_id","email");