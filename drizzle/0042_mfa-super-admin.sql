-- B2 (#214, ADR-007): segundo fator do super_admin. `user_mfa` só guarda fator
-- confirmado (segredo cifrado, ADR-006); `mfa_recovery_codes` guarda o hash scrypt
-- dos 10 códigos de uso único.
CREATE TABLE "mfa_recovery_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mfa" (
	"account_id" text PRIMARY KEY NOT NULL,
	"totp_secret" text NOT NULL,
	"enrolled_at" timestamp with time zone NOT NULL,
	"last_used_step" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_account_id_user_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_account_id_user_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mfa_recovery_codes_account" ON "mfa_recovery_codes" USING btree ("account_id");