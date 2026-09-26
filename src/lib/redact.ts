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
