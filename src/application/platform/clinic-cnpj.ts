import type { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { ValidationError } from '@/domain/shared/errors';
import { isUniqueViolation } from '@/lib/db-errors';

export const DUPLICATE_CNPJ_MESSAGE = 'Já existe clínica com este CNPJ';
export const DUPLICATE_CPF_MESSAGE =
  'Já existe profissional autônoma com este CPF';
const CNPJ_INDEX = 'uq_clinics_cnpj';
const CPF_INDEX = 'uq_clinics_cpf_hash';

/**
 * CNPJ repetido entre clínicas é recusado (design, Open 1); o CPF da autônoma
 * também (#977): um documento, um cadastro.
 */
export async function assertCnpjAvailable(
  clinics: ClinicRepository,
  clinic: Clinic,
): Promise<void> {
  if (clinic.cpf) {
    const cpfOwner = await clinics.findByCpf(clinic.cpf);
    if (cpfOwner && cpfOwner.id !== clinic.id) {
      throw new ValidationError(DUPLICATE_CPF_MESSAGE);
    }
  }
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
  if (isUniqueViolation(error, CPF_INDEX)) {
    throw new ValidationError(DUPLICATE_CPF_MESSAGE);
  }
  throw isUniqueViolation(error, CNPJ_INDEX)
    ? new ValidationError(DUPLICATE_CNPJ_MESSAGE)
    : error;
}
