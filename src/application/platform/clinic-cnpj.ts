import type { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { ValidationError } from '@/domain/shared/errors';
import { isUniqueViolation } from '@/lib/db-errors';

export const DUPLICATE_CNPJ_MESSAGE = 'Já existe clínica com este CNPJ';
const CNPJ_INDEX = 'uq_clinics_cnpj';

/** CNPJ repetido entre clínicas é recusado (design, Open 1). */
export async function assertCnpjAvailable(
  clinics: ClinicRepository,
  clinic: Clinic,
): Promise<void> {
  if (!clinic.cnpj) return;
  const owner = await clinics.findByCnpj(clinic.cnpj);
  if (owner && owner.id !== clinic.id) {
    throw new ValidationError(DUPLICATE_CNPJ_MESSAGE);
  }
}

/**
 * Corrida: duas gravações passam pela checagem prévia e `uq_clinics_cnpj` deixa
 * só uma gravar — a outra vira a mesma mensagem, não `500`.
 */
export function rethrowCnpjViolation(error: unknown): never {
  throw isUniqueViolation(error, CNPJ_INDEX)
    ? new ValidationError(DUPLICATE_CNPJ_MESSAGE)
    : error;
}
