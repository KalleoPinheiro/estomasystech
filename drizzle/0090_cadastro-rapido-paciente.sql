-- Cadastro rápido de paciente na nova consulta (#972). Coluna nova nasce `false` em toda linha
-- existente; o código antigo a ignora.
-- Desfazer: ALTER TABLE "patients" DROP COLUMN "registration_incomplete";
ALTER TABLE "patients" ADD COLUMN "registration_incomplete" boolean DEFAULT false NOT NULL;
