import type { EmailGateway } from '@/application/ports/email-gateway';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import {
  type DataSubjectRequestRepository,
  daysUntilDeadline,
} from '@/domain/patient/data-subject-request';
import { logError } from '@/lib/log-error';
import { companyAdminEmails, queueLinkLine } from './data-subject-requests';

/** Antecedência padrão do alerta de prazo, em dias (#312). */
export const DEFAULT_DEADLINE_ALERT_DAYS = 3;
const MAX_DEADLINE_ALERT_DAYS = 14;

/**
 * `DATA_REQUEST_ALERT_DAYS`: quantos dias antes do vencimento o Admin é
 * avisado. Valor ausente, não inteiro ou fora de 1–14 volta ao padrão (3).
 */
export function deadlineAlertDaysFromEnv(
  raw: string | undefined = process.env.DATA_REQUEST_ALERT_DAYS,
): number {
  const value = Number(raw?.trim());
  return Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_DEADLINE_ALERT_DAYS
    ? value
    : DEFAULT_DEADLINE_ALERT_DAYS;
}

export const DEADLINE_ALERT_EMAIL_SUBJECT =
  'Pedidos de titular de dados perto do prazo';

/** Aviso sem nome de paciente nem texto de pedido: só a contagem e o link. */
export const deadlineAlertEmailText = (count: number): string =>
  [
    'Olá,',
    '',
    count === 1
      ? '1 pedido sobre dados pessoais está perto de vencer o prazo de 15 dias (LGPD, art. 19) ou já venceu.'
      : `${count} pedidos sobre dados pessoais estão perto de vencer o prazo de 15 dias (LGPD, art. 19) ou já venceram.`,
    queueLinkLine(),
  ].join('\n');

export interface DeadlineAlertSummary {
  /** Pedidos incluídos no aviso desta execução. */
  alerted: number;
  /** Havia pedidos a avisar, mas a clínica não tem canal de e-mail. */
  skipped: number;
  failed: number;
}

/**
 * Job diário (junto dos lembretes, por empresa): avisa os Admins de Empresa
 * dos pedidos do titular pendentes que vencem em até `alertDays` dias — ou já
 * venceram sem aviso. Cada pedido é avisado uma vez (`deadlineAlertedAt`); sem
 * canal de e-mail da clínica nada é marcado, e o aviso sai quando houver.
 */
export class AlertDataRequestDeadlines {
  constructor(
    private readonly requests: DataSubjectRequestRepository,
    private readonly accounts: UserAccountRepository,
    private readonly email: EmailGateway,
    private readonly alertDays: number = deadlineAlertDaysFromEnv(),
  ) {}

  async execute(now: Date = new Date()): Promise<DeadlineAlertSummary> {
    const summary: DeadlineAlertSummary = { alerted: 0, skipped: 0, failed: 0 };
    const due = (await this.requests.listByStatus('pending')).filter(
      (request) =>
        request.deadlineAlertedAt === null &&
        daysUntilDeadline(request.createdAt, now) <= this.alertDays,
    );
    if (due.length === 0) {
      return summary;
    }
    if (!(await this.email.isEnabled())) {
      summary.skipped = due.length;
      return summary;
    }
    const delivered = await this.sendAlert(due.length);
    if (!delivered) {
      summary.failed = due.length;
      return summary;
    }
    for (const request of due) {
      try {
        await this.requests.save(request.markDeadlineAlerted(now));
        summary.alerted += 1;
      } catch (error) {
        // Decidido no meio do caminho ou falha de gravação: não reenvia à toa.
        logError(
          `Pedido do titular ${request.id}: falha ao marcar aviso`,
          error,
        );
        summary.failed += 1;
      }
    }
    return summary;
  }

  /** `true` se ao menos um Admin recebeu o aviso. */
  private async sendAlert(count: number): Promise<boolean> {
    const recipients = await companyAdminEmails(this.accounts);
    let delivered = false;
    for (const to of recipients) {
      try {
        await this.email.send({
          to,
          subject: DEADLINE_ALERT_EMAIL_SUBJECT,
          text: deadlineAlertEmailText(count),
        });
        delivered = true;
      } catch (error) {
        logError('Aviso de prazo do titular: falha no envio', error);
      }
    }
    return delivered;
  }
}
