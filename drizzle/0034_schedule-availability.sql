CREATE TABLE "professional_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"professional_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_closures" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"professional_id" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_settings" ADD COLUMN "lunch_start_minute" integer;--> statement-breakpoint
ALTER TABLE "schedule_settings" ADD COLUMN "lunch_end_minute" integer;--> statement-breakpoint
ALTER TABLE "professional_availability" ADD CONSTRAINT "professional_availability_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_availability" ADD CONSTRAINT "professional_availability_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_closures" ADD CONSTRAINT "schedule_closures_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_closures" ADD CONSTRAINT "schedule_closures_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_professional_availability_professional" ON "professional_availability" USING btree ("professional_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_closures_clinic_dates" ON "schedule_closures" USING btree ("clinic_id","starts_on","ends_on");