ALTER TABLE "guardians" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "email_hash" text;--> statement-breakpoint
CREATE INDEX "idx_guardians_phone_hash" ON "guardians" USING btree ("clinic_id","phone_hash");--> statement-breakpoint
CREATE INDEX "idx_guardians_email_hash" ON "guardians" USING btree ("clinic_id","email_hash");