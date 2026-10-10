-- C1 (#264, ADR-011): canal de e-mail por clínica. Tabela nova e vazia:
-- nada a sanear; sem linha, a clínica simplesmente não envia.
CREATE TABLE "clinic_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"sender" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"secret_last4" text NOT NULL,
	"last_status" text,
	"last_status_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "clinic_channels_channel_check" CHECK ("clinic_channels"."channel" IN ('email')),
	CONSTRAINT "clinic_channels_provider_check" CHECK ("clinic_channels"."provider" IN ('resend')),
	CONSTRAINT "clinic_channels_last_status_check" CHECK ("clinic_channels"."last_status" IS NULL OR "clinic_channels"."last_status" IN ('ok', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "clinic_channels" ADD CONSTRAINT "clinic_channels_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clinic_channels_clinic_channel" ON "clinic_channels" USING btree ("clinic_id","channel");