import type { MessagingGateway } from '@/application/ports/messaging-gateway';
import { normalizeBrazilianPhone } from '@/domain/messaging/whatsapp-link';

// Movida para o domínio (link `wa.me`); reexportada para quem já importa daqui.
export { normalizeBrazilianPhone };

export interface MetaWhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * WhatsApp via Meta Cloud API (mensagem de texto).
 * Atenção: fora da janela de 24h de atendimento, a Meta exige template
 * aprovado — configure os templates no Business Manager e ajuste aqui se
 * a clínica não tiver conversa aberta com o paciente.
 */
export class MetaWhatsAppGateway implements MessagingGateway {
  readonly enabled = true;

  constructor(private readonly config: MetaWhatsAppConfig) {}

  async sendText(phone: string, message: string): Promise<void> {
    const to = normalizeBrazilianPhone(phone);
    const response = await fetch(
      `${GRAPH_API_BASE}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`WhatsApp API ${response.status}: ${body.slice(0, 300)}`);
    }
  }
}

export function metaWhatsAppConfigFromEnv(): MetaWhatsAppConfig | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return null;
  }
  return { token, phoneNumberId };
}
