import { ValidationError } from '../shared/errors';

export const INVALID_CNPJ_MESSAGE =
  'CNPJ inválido: use 14 caracteres (12 letras ou números e 2 dígitos)';

const CNPJ_SEPARATORS = /[\s./-]/g;
/** 12 posições alfanuméricas + 2 dígitos verificadores (CNPJ alfanumérico, jul/2026). */
const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/;

/**
 * Forma canônica `AA.AAA.AAA/AAAA-DD`, com ou sem pontuação na entrada. Uma
 * forma só é o que deixa `uq_clinics_cnpj` recusar o mesmo CNPJ digitado de
 * dois jeitos. O dígito verificador não é conferido (B4, Landing).
 */
export function normalizeCnpj(raw: string): string {
  const compact = raw.replace(CNPJ_SEPARATORS, '').toUpperCase();
  if (!CNPJ_PATTERN.test(compact)) {
    throw new ValidationError(INVALID_CNPJ_MESSAGE);
  }
  return `${compact.slice(0, 2)}.${compact.slice(2, 5)}.${compact.slice(5, 8)}/${compact.slice(8, 12)}-${compact.slice(12)}`;
}
