-- B4 (#214): contato da clínica com a plataforma e CNPJ único entre clínicas
-- (design, Open 1). Sem saneamento: CNPJ repetido já gravado faz a migração
-- falhar e nada muda, como a 0041 (nada em produção).
ALTER TABLE "clinics" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "contact_email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clinics_cnpj" ON "clinics" USING btree ("cnpj") WHERE "clinics"."cnpj" IS NOT NULL;