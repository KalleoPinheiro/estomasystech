/**
 * Mascaramento de contato para logs (CWE-532, LGPD art. 46). O log de dry-run
 * precisa dizer *para quem* iria a mensagem sem gravar o dado pessoal inteiro:
 * mantém só o bastante para uma pessoa reconhecer o destinatário.
 */

const HIDDEN = '***';
const HIDDEN_DIGITS = '******';
const VISIBLE_PHONE_TAIL = 4;
const VISIBLE_COUNTRY_CODE = 2;

/** `fulano@x.com` → `fu***@x.com`. Sem `@` válido, nada fica visível. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return HIDDEN;
  const local = email.slice(0, at);
  const visible = Math.min(2, local.length - 1);
  return `${local.slice(0, visible)}${HIDDEN}${email.slice(at)}`;
}

/**
 * `+5511999997777` → `+55******7777`; `(11) 99999-7777` → `******7777`.
 * O miolo tem tamanho fixo para não revelar quantos dígitos o número tem.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= VISIBLE_PHONE_TAIL + VISIBLE_COUNTRY_CODE) {
    return HIDDEN_DIGITS;
  }
  const tail = digits.slice(-VISIBLE_PHONE_TAIL);
  const country = phone.trim().startsWith('+')
    ? `+${digits.slice(0, VISIBLE_COUNTRY_CODE)}`
    : '';
  return `${country}${HIDDEN_DIGITS}${tail}`;
}

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Sequência de dígitos com separadores comuns de CPF, CNPJ, telefone e data. */
const NUMBER_PATTERN = /(?<![\w-])\+?\d[\d\s()./-]*\d(?![\w-])/g;
const MIN_HIDDEN_DIGITS = 8;

/**
 * Texto livre que pode sair do processo (mensagem de erro no log e no
 * GlitchTip, #212): troca e-mail e número longo (CPF, CNPJ, telefone, data)
 * por um marcador. Ids (UUID) e números curtos (status HTTP, contagem)
 * ficam.
 */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[e-mail]')
    .replace(NUMBER_PATTERN, (match) =>
      match.replace(/\D/g, '').length >= MIN_HIDDEN_DIGITS ? '[número]' : match,
    );
}
