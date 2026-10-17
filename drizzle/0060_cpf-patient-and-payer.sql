ALTER TABLE "invoice_payments" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD COLUMN "payer_cpf" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "cpf" text;