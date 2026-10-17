import type {
  ClinicalConditionRepository,
  ConditionPhotoRepository,
} from '@/domain/clinical/clinical-repositories';
import { PATIENT_MAX_PHOTOS_PER_DAY } from '@/domain/clinical/condition-photo';
import { ValidationError } from '@/domain/shared/errors';

const DAY_MS = 86_400_000;

/**
 * Cota de fotos do paciente no portal (#213): no máximo
 * `PATIENT_MAX_PHOTOS_PER_DAY` nas últimas 24 h, somando todas as condições.
 * Contagem e gravação não são atômicas: envios simultâneos podem passar do
 * teto por uma ou duas fotos — o limite contém abuso, não é contábil.
 */
export async function assertPatientPhotoQuota(
  conditions: ClinicalConditionRepository,
  photos: ConditionPhotoRepository,
  patientId: string,
  now: Date = new Date(),
): Promise<void> {
  const own = await conditions.findByPatientId(patientId);
  const sent = await photos.countPatientUploadsSince(
    own.map((condition) => condition.id),
    new Date(now.getTime() - DAY_MS),
  );
  if (sent >= PATIENT_MAX_PHOTOS_PER_DAY) {
    throw new ValidationError(
      `Você já enviou ${PATIENT_MAX_PHOTOS_PER_DAY} fotos nas últimas 24 horas: envie as próximas amanhã ou fale com a clínica`,
    );
  }
}
