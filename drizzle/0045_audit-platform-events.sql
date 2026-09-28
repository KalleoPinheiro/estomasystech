-- B6 (#210, #214): evento sem empresa vira evento de plataforma (`clinic_id` nulo),
-- visível só ao super_admin. Porta sem volta: voltar a NOT NULL exige decidir para
-- onde vão os eventos nulos. Eventos antigos da legacy-clinic não mudam (Open 4).
ALTER TABLE "audit_events" ALTER COLUMN "clinic_id" DROP NOT NULL;
