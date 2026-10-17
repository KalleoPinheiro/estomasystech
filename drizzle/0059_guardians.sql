CREATE TABLE "guardians" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"full_name" text NOT NULL,
	"relationship" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "guardian_id" text;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guardians_clinic" ON "guardians" USING btree ("clinic_id","full_name");--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_patients_guardian" ON "patients" USING btree ("guardian_id");