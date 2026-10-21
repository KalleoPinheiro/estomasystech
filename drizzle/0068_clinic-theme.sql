ALTER TABLE "clinics" ADD COLUMN "theme_mode" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "theme_accent" text DEFAULT 'violet' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_theme_mode_check" CHECK ("clinics"."theme_mode" IN ('light', 'dark', 'system'));--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_theme_accent_check" CHECK ("clinics"."theme_accent" IN ('cyan', 'violet', 'mint', 'amber'));