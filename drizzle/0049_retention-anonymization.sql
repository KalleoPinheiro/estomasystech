-- #294: retenção e anonimização por tipo de dado. Nada é apagado: marcadores
-- de anonimização e a data de desativação das contas. Conta já inativa conta
-- o prazo de 2 anos a partir desta migração (a data real não foi guardada).
ALTER TABLE "waitlist_entries" ALTER COLUMN "patient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "condition_photos" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
UPDATE "user_accounts" SET "deactivated_at" = now() WHERE "active" = false;
