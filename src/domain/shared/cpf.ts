import { ValidationError } from './errors';

export const INVALID_CPF_MESSAGE =
  'CPF inválido: informe os 11 dígitos, com o dígito verificador correto';

const CPF_LENGTH = 11;
const CPF_ACCEPTED_CHARS = /^[\d.\-\s]+$/;
const CPF_SEPARATORS = /[.\-\s]/g;
const VISIBLE_FROM = 6;
const VISIBLE_TO = 9;

/** Dígito verificador de `base` (9 ou 10 dígitos): pesos de `base.length + 1` a 2. */
function checkDigit(base: string): number {
  const sum = [...base].reduce(
    (acc, digit, index) => acc + Number(digit) * (base.length + 1 - index),
    0,
  );
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Só `\d{11}` com os dois dígitos verificadores corretos; `000.000.000-00` e afins não valem. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const first = checkDigit(digits.slice(0, 9));
  const second = checkDigit(digits.slice(0, 10));
  return digits.endsWith(`${first}${second}`);
}

/**
 * Forma canônica guardada: 11 dígitos, sem máscara. Aceita a máscara
 * `000.000.000-00` na entrada; qualquer outro caractere é recusado. Uma forma
 * só impede o mesmo CPF digitado de dois jeitos (#326).
 */
export function normalizeCpf(raw: string): string {
  const trimmed = raw.trim();
  if (!CPF_ACCEPTED_CHARS.test(trimmed)) {
    throw new ValidationError(INVALID_CPF_MESSAGE);
  }
  const digits = trimmed.replace(CPF_SEPARATORS, '');
  if (digits.length !== CPF_LENGTH || !isValidCpf(digits)) {
    throw new ValidationError(INVALID_CPF_MESSAGE);
  }
  return digits;
}

/** Vazio vira `null` (CPF é opcional no cadastro); preenchido tem de ser válido. */
export function normalizeOptionalCpf(
  raw: string | null | undefined,
): string | null {
  return raw === null || raw === undefined || raw.trim() === ''
    ? null
    : normalizeCpf(raw);
}

/** `12345678909` → `123.456.789-09`. */
export function formatCpf(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * `12345678909` → `***.***.789-**`: só três dígitos do miolo ficam visíveis,
 * o bastante para a recepção conferir com o paciente, sem expor o número
 * (LGPD art. 6º, III). O CPF inteiro só sai no recibo.
 */
export function maskCpf(digits: string): string {
  return `***.***.${digits.slice(VISIBLE_FROM, VISIBLE_TO)}-**`;
}
