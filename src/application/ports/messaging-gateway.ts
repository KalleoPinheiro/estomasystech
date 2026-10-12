import { logger } from '@/lib/observability/logger';
import { maskPhone } from '@/lib/redact';

export interface MessagingGateway {
  /** false = canal desativado (sem credenciais) — chamador trata como "pulado". */
  readonly enabled: boolean;
  /** Envia texto para o telefone (formato E.164 ou nacional BR). Lança em falha de API. */
  sendText(phone: string, message: string): Promise<void>;
}

/**
 * Canal desativado: loga só metadados do que enviaria (dry-run) e nunca falha.
 * why: o corpo leva nome do paciente e data da consulta, e o telefone é dado
 * pessoal — nenhum dos dois vai para o log (CWE-532, LGPD art. 46).
 */
export class NullMessagingGateway implements MessagingGateway {
  readonly enabled = false;

  async sendText(phone: string, message: string): Promise<void> {
    logger.info(
      `[mensageria desativada] WhatsApp para ${maskPhone(phone)} (${message.length} caracteres)`,
    );
  }
}
