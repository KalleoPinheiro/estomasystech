DROP INDEX "uq_patients_clinic_email";--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "email" DROP NOT NULL;