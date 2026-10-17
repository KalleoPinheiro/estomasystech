import { ValidationError } from '../shared/errors';

export const INVALID_CNPJ_MESSAGE =
  'CNPJ inválido: use 14 caracteres (12 letras ou números e 2 dígitos)';
export const INVALID_CNPJ_CHECK_DIGIT_MESSAGE =
  'CNPJ inválido: dígito verificador não confere';

const CNPJ_SEPARATORS = /[\s./-]/g;
/** 12 posições alfanuméricas + 2 dígitos verificadores (CNPJ alfanumérico, jul/2026). */
const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/;
/** Pesos do módulo 11 da Receita; o 2º dígito usa os mesmos pesos deslocados em uma posição. */
const WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Valor de cada caractere no cálculo: código ASCII menos 48 (`0`–`9` → 0–9, `A`–`Z` → 17–42). */
function charValue(char: string): number {
  return char.charCodeAt(0) - 48;
}

function checkDigit(chars: string): number {
  const weights = WEIGHTS.slice(WEIGHTS.length - chars.length);
  const sum = [...chars].reduce(
    (acc, char, index) => acc + charValue(char) * (weights[index] as number),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Os dois dígitos verificadores esperados para os 12 primeiros caracteres. */
function expectedCheckDigits(base: string): string {
  const first = checkDigit(base);
  return `${first}${checkDigit(`${base}${first}`)}`;
}

/**
 * Forma canônica `AA.AAA.AAA/AAAA-DD`, com ou sem pontuação na entrada. Uma
 * forma só é o que deixa `uq_clinics_cnpj` recusar o mesmo CNPJ digitado de
 * dois jeitos. Confere o dígito verificador (módulo 11 da Receita, válido
 * também para o CNPJ alfanumérico) — decisão do dono em #248.
 */
export function normalizeCnpj(raw: string): string {
  const compact = raw.replace(CNPJ_SEPARATORS, '').toUpperCase();
  if (!CNPJ_PATTERN.test(compact)) {
    throw new ValidationError(INVALID_CNPJ_MESSAGE);
  }
  if (expectedCheckDigits(compact.slice(0, 12)) !== compact.slice(12)) {
    throw new ValidationError(INVALID_CNPJ_CHECK_DIGIT_MESSAGE);
  }
  return `${compact.slice(0, 2)}.${compact.slice(2, 5)}.${compact.slice(5, 8)}/${compact.slice(8, 12)}-${compact.slice(12)}`;
}
