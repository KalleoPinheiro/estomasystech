ALTER TABLE "condition_assessments" ADD COLUMN "infection_level" text;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "infection_signs" text;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "wound_edges" text;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "exudate_type" text;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "granulation_pct" integer;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "epithelial_pct" integer;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "slough_pct" integer;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD COLUMN "necrotic_pct" integer;--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD CONSTRAINT "condition_assessments_infection_level_check" CHECK ("condition_assessments"."infection_level" IN ('none', 'inflammation', 'local', 'spreading', 'systemic'));--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD CONSTRAINT "condition_assessments_wound_edges_check" CHECK ("condition_assessments"."wound_edges" IN ('attached', 'detached', 'rolled', 'macerated', 'undermined', 'hyperkeratotic', 'epithelializing'));--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD CONSTRAINT "condition_assessments_exudate_type_check" CHECK ("condition_assessments"."exudate_type" IN ('serous', 'serosanguineous', 'sanguineous', 'purulent'));--> statement-breakpoint
ALTER TABLE "condition_assessments" ADD CONSTRAINT "condition_assessments_tissue_pct_check" CHECK (coalesce("condition_assessments"."granulation_pct", 0) BETWEEN 0 AND 100 AND coalesce("condition_assessments"."epithelial_pct", 0) BETWEEN 0 AND 100 AND coalesce("condition_assessments"."slough_pct", 0) BETWEEN 0 AND 100 AND coalesce("condition_assessments"."necrotic_pct", 0) BETWEEN 0 AND 100 AND coalesce("condition_assessments"."granulation_pct", 0) + coalesce("condition_assessments"."epithelial_pct", 0) + coalesce("condition_assessments"."slough_pct", 0) + coalesce("condition_assessments"."necrotic_pct", 0) <= 100);