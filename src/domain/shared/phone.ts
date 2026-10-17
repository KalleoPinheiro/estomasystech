import { ValidationError } from './errors';

/** DDDs em uso no Brasil (Anatel). Qualquer outro é digitação errada. */
const BRAZILIAN_AREA_CODES = new Set([
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '21',
  '22',
  '24',
  '27',
  '28',
  '31',
  '32',
  '33',
  '34',
  '35',
  '37',
  '38',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '51',
  '53',
  '54',
  '55',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '68',
  '69',
  '71',
  '73',
  '74',
  '75',
  '77',
  '79',
  '81',
  '82',
  '83',
  '84',
  '85',
  '86',
  '87',
  '88',
  '89',
  '91',
  '92',
  '93',
  '94',
  '95',
  '96',
  '97',
  '98',
  '99',
]);

const COUNTRY_CODE = '55';
const AREA_CODE_LENGTH = 2;
const LANDLINE_LENGTH = 10;
const MOBILE_LENGTH = 11;
const E164_BR = /^\+55\d{10,11}$/;

export const PHONE_MESSAGES = {
  empty: 'Telefone é obrigatório',
  international:
    'Só aceitamos telefone do Brasil (DDI +55). Informe DDD e número.',
  missingAreaCode:
    'Informe o DDD junto com o número, por exemplo (11) 99999-0000.',
  invalidAreaCode: 'DDD inválido. Confira os dois primeiros dígitos.',
  mobileWithoutNine:
    'Celular precisa do 9 antes do número, por exemplo (11) 99999-0000.',
  invalidLength:
    'Telefone inválido. Use DDD + 8 dígitos (fixo) ou DDD + 9 dígitos (celular).',
} as const;

export type PhoneParseResult =
  | { ok: true; e164: string }
  | { ok: false; reason: string };

const fail = (reason: string): PhoneParseResult => ({ ok: false, reason });

/** Remove DDI 55 quando o tamanho confirma que é DDI e não o DDD 55 (RS). */
function stripCountryCode(digits: string): string {
  const withCountry = digits.startsWith(COUNTRY_CODE);
  const nationalLength = digits.length - COUNTRY_CODE.length;
  const looksNational =
    nationalLength === LANDLINE_LENGTH || nationalLength === MOBILE_LENGTH;
  return withCountry && looksNational
    ? digits.slice(COUNTRY_CODE.length)
    : digits;
}

/** Zero de tronco: "011 99999-0000" → "11999990000". */
function stripTrunkZero(digits: string): string {
  if (!digits.startsWith('0')) return digits;
  const rest = digits.slice(1);
  return rest.length === LANDLINE_LENGTH || rest.length === MOBILE_LENGTH
    ? rest
    : digits;
}

function validateNational(national: string): PhoneParseResult {
  if (national.length < LANDLINE_LENGTH) {
    return fail(
      national.length >= 8 && national.length <= 9
        ? PHONE_MESSAGES.missingAreaCode
        : PHONE_MESSAGES.invalidLength,
    );
  }
  if (national.length > MOBILE_LENGTH) {
    return fail(PHONE_MESSAGES.invalidLength);
  }
  if (!BRAZILIAN_AREA_CODES.has(national.slice(0, AREA_CODE_LENGTH))) {
    return fail(PHONE_MESSAGES.invalidAreaCode);
  }
  const subscriber = national.slice(AREA_CODE_LENGTH);
  if (national.length === MOBILE_LENGTH && !subscriber.startsWith('9')) {
    return fail(PHONE_MESSAGES.invalidLength);
  }
  if (national.length === LANDLINE_LENGTH && !/^[2-5]/.test(subscriber)) {
    return fail(
      /^[6-9]/.test(subscriber)
        ? PHONE_MESSAGES.mobileWithoutNine
        : PHONE_MESSAGES.invalidLength,
    );
  }
  return { ok: true, e164: `+${COUNTRY_CODE}${national}` };
}

/**
 * Normaliza telefone brasileiro digitado em formatos comuns (máscara, zero de
 * tronco, +55) para E.164. Sem DDD é rejeitado, nunca adivinhado (#324).
 */
export function parseBrazilianPhone(raw: string): PhoneParseResult {
  const text = raw.trim();
  if (text.length === 0) return fail(PHONE_MESSAGES.empty);
  if (/[^\d\s()+\-.]/.test(text)) return fail(PHONE_MESSAGES.invalidLength);

  const digits = text.replace(/\D/g, '');
  const explicitInternational = text.startsWith('+') || text.startsWith('00');
  const body = text.startsWith('00') ? digits.slice(2) : digits;
  if (explicitInternational && !body.startsWith(COUNTRY_CODE)) {
    return fail(PHONE_MESSAGES.international);
  }
  const national = stripTrunkZero(
    explicitInternational
      ? body.slice(COUNTRY_CODE.length)
      : stripCountryCode(body),
  );
  return validateNational(national);
}

/** E.164 brasileiro já normalizado (como guardado desde #324). */
export const isBrazilianE164 = (phone: string): boolean => E164_BR.test(phone);

/** Normaliza ou lança `ValidationError` com o motivo para a recepção. */
export function normalizeBrazilianPhoneOrThrow(raw: string): string {
  const result = parseBrazilianPhone(raw);
  if (!result.ok) throw new ValidationError(result.reason);
  return result.e164;
}

/** `+5511999990000` → `(11) 99999-0000`; texto fora do padrão volta como está. */
export function formatBrazilianPhone(phone: string): string {
  if (!isBrazilianE164(phone)) return phone;
  const national = phone.slice(1 + COUNTRY_CODE.length);
  const area = national.slice(0, AREA_CODE_LENGTH);
  const subscriber = national.slice(AREA_CODE_LENGTH);
  const split = subscriber.length - 4;
  return `(${area}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`;
}
