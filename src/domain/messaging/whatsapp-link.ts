import { ValidationError } from '../shared/errors';
import { parseBrazilianPhone } from '../shared/phone';

/**
 * DDD+número nacional → E.164 Brasil (55...); mantém números já internacionais.
 * Só o gateway da Meta usa (remoção na #328); o link `wa.me` valida com `whatsappNumber`.
 */
export function normalizeBrazilianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

/**
 * Número só com dígitos (E.164 sem `+`) para o `wa.me`/Cloud API, ou o motivo
 * de não ser possível gerar o link (#324): nunca devolve número inválido.
 */
export function whatsappNumber(phone: string): string {
  const result = parseBrazilianPhone(phone);
  if (!result.ok) {
    throw new ValidationError(
      `Não foi possível gerar o link do WhatsApp: ${result.reason} Corrija o telefone no cadastro do paciente.`,
    );
  }
  return result.e164.slice(1);
}

/** Click-to-chat oficial do WhatsApp: abre a conversa com o texto pronto. */
export const whatsappLink = (phone: string, text: string): string =>
  `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
