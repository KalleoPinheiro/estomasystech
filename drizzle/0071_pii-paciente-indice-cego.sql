ALTER TABLE "patients" ADD COLUMN "birth_date_enc" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "cpf_hash" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "email_hash" text;--> statement-breakpoint
CREATE INDEX "idx_patients_cpf_hash" ON "patients" USING btree ("clinic_id","cpf_hash");--> statement-breakpoint
CREATE INDEX "idx_patients_phone_hash" ON "patients" USING btree ("clinic_id","phone_hash");--> statement-breakpoint
CREATE INDEX "idx_patients_email_hash" ON "patients" USING btree ("clinic_id","email_hash");