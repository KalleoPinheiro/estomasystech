-- Dado legado: se uma recifra anterior deixou o mesmo hash de CPF em mais de um paciente da clínica,
-- só o de menor id fica com ele (a mesma regra do backfill); o hash é derivado e o `data:reencrypt` recalcula.
UPDATE "patients" AS p SET "cpf_hash" = NULL WHERE p."cpf_hash" IS NOT NULL AND EXISTS (SELECT 1 FROM "patients" AS q WHERE q."clinic_id" = p."clinic_id" AND q."cpf_hash" = p."cpf_hash" AND q."id" < p."id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_patients_clinic_cpf_hash" ON "patients" USING btree ("clinic_id","cpf_hash") WHERE "patients"."cpf_hash" IS NOT NULL;