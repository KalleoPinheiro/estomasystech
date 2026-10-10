import { maskEmail } from '@/lib/redact';

export interface EmailMessage {
  /** Destinatário único — convite e reset são sempre 1:1 com uma conta. */
  to: string;
  subject: string;
  /** Corpo em texto puro; o link é a única informação essencial. */
  text: string;
}

export interface EmailGateway {
  /**
   * false = canal desativado (sem credenciais) — chamador trata como "pulado".
   * Assíncrono porque o canal da clínica só é lido no banco no primeiro uso
   * (ADR-011, `LazyEmailGateway`).
   */
  isEnabled(): Promise<boolean>;
  /** Envia a mensagem. Lança em falha de API. */
  send(message: EmailMessage): Promise<void>;
}

/** Link de definição/redefinição de senha — o que o dev precisa para seguir sem e-mail real. */
const AUTH_LINK = /https?:\/\/\S+\/definir-senha\?token=[\w-]+/;

/**
 * Canal desativado: loga só metadados do que enviaria (dry-run) e nunca falha.
 * why: o corpo pode levar nome do paciente e data da consulta, e o link de
 * convite/reset é uma credencial — CWE-532, LGPD art. 46. O corpo nunca vai
 * para o log; fora de produção, só o link de senha, para o fluxo de dev e o
 * E2E (`e2e/support/invite-log.ts`) conseguirem definir senha sem Resend.
 */
export class NullEmailGateway implements EmailGateway {
  async isEnabled(): Promise<boolean> {
    return false;
  }

  async send(message: EmailMessage): Promise<void> {
    const header = `[e-mail desativado] Para ${maskEmail(message.to)} — ${message.subject}`;
    const link =
      process.env.NODE_ENV === 'production'
        ? null
        : message.text.match(AUTH_LINK)?.[0];
    console.info(
      link ? `${header}\nLink (só fora de produção): ${link}` : header,
    );
  }
}

/**
 * Gateway montado só no primeiro uso: o da clínica exige ler o canal dela no
 * banco, e a maioria dos requests nunca envia e-mail (mesmo molde do
 * `LazyCalendarGateway`). A resolução é memorizada; se falhar, a próxima
 * chamada tenta de novo.
 */
export class LazyEmailGateway implements EmailGateway {
  private pending: Promise<EmailGateway> | null = null;

  constructor(private readonly load: () => Promise<EmailGateway>) {}

  resolve(): Promise<EmailGateway> {
    this.pending ??= this.load().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }

  async isEnabled(): Promise<boolean> {
    return (await this.resolve()).isEnabled();
  }

  async send(message: EmailMessage): Promise<void> {
    return (await this.resolve()).send(message);
  }
}
