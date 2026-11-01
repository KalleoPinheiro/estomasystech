import {
  type EmailGateway,
  type EmailMessage,
  NullEmailGateway,
} from '@/application/ports/email-gateway';
import { appUrlFromEnv } from '@/application/reminders/portal-url';
import type { EmailProvider } from '@/domain/clinic/clinic-channel';

export interface ResendConfig {
  apiKey: string;
  /** Remetente no formato aceito pelo provedor: "Nome <endereco@dominio>" ou só o endereço. */
  from: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Rodapé de todo e-mail com o link do aviso de privacidade (LGPD, art. 9º;
 * #216). Sem `APP_URL` absoluta não há link, e a mensagem sai como está.
 */
export function withPrivacyFooter(text: string): string {
  const base = appUrlFromEnv();
  return base
    ? `${text}\n\n--\nAviso de privacidade: ${base}/privacidade`
    : text;
}

/**
 * E-mail transacional via API HTTP do Resend (convite e reset de senha).
 * Sem SDK: a chamada é um POST JSON, mesmo molde do `MetaWhatsAppGateway`.
 */
export class ResendEmailGateway implements EmailGateway {
  constructor(private readonly config: ResendConfig) {}

  async isEnabled(): Promise<boolean> {
    return true;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      // Envio de e-mail nunca vem do cache do Next (#559).
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: withPrivacyFooter(message.text),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend API ${response.status}: ${body.slice(0, 300)}`);
    }
  }
}

export function resendConfigFromEnv(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return null;
  }
  return { apiKey, from };
}

/**
 * Gateway de cada provedor de e-mail, a partir da credencial da clínica
 * (ADR-011). Um provedor novo entra aqui e em `EMAIL_PROVIDERS`, sem mexer no
 * container.
 */
export const EMAIL_PROVIDER_GATEWAYS: Record<
  EmailProvider,
  (config: ResendConfig) => EmailGateway
> = {
  resend: (config) => new ResendEmailGateway(config),
};

/**
 * Canal da **plataforma** (ADR-011): só as contas sem clínica (super admin)
 * usam, e é opcional — sem `RESEND_API_KEY`/`EMAIL_FROM` o gateway é o nulo,
 * também em produção. Nenhum e-mail de clínica sai por aqui.
 */
export function platformEmailGateway(): EmailGateway {
  const config = resendConfigFromEnv();
  return config ? new ResendEmailGateway(config) : new NullEmailGateway();
}
