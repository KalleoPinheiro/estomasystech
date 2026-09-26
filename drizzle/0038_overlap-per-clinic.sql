-- Issue #187: a constraint de 0014 não incluía clinic_id, então toda consulta
-- sem profissional usava o mesmo sentinel '*any*' em TODAS as empresas — uma
-- empresa bloqueava o horário da outra (indisponibilidade + canal lateral).
-- Conflito de agenda passa a ser por empresa e profissional.
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlap";
--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "clinic_id" WITH =,
    COALESCE("professional_id", '*any*') WITH =,
    tstzrange("starts_at", "ends_at_buffered") WITH &&
  )
  WHERE (status IN ('scheduled', 'confirmed'));
