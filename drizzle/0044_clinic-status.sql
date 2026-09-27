-- B5 (#214): estado da clínica. `suspended` nega o login de toda conta dela e
-- pausa os lembretes; nenhum dado é apagado. Clínicas existentes ficam `active`.
ALTER TABLE "clinics" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "status_changed_by" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_status_check" CHECK ("clinics"."status" IN ('active', 'suspended'));