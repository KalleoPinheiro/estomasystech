/** DDD+número nacional → E.164 Brasil (55...); mantém números já internacionais. */
export function normalizeBrazilianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

/** Click-to-chat oficial do WhatsApp: abre a conversa com o texto pronto. */
export const whatsappLink = (phone: string, text: string): string =>
  `https://wa.me/${normalizeBrazilianPhone(phone)}?text=${encodeURIComponent(text)}`;
