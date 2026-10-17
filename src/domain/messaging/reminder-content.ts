import { appTimeZone } from '../shared/time-zone';
import type { ReminderKind } from './reminder-log';

export interface ReminderContent {
  subject: string;
  text: string;
}

interface CommonData {
  firstName: string;
  clinicName: string;
  /** `<APP_URL>/portal`, ou `null` sem URL http(s) válida. */
  portalUrl: string | null;
  /**
   * Primeiro nome do paciente quando o destinatário é o responsável dele
   * (#329): o texto fala do paciente em terceira pessoa e não leva o portal,
   * que é a conta do próprio paciente.
   */
  onBehalfOf?: string;
}

export interface ConfirmationData extends CommonData {
  startsAt: Date;
  /** Só no `wa.me`: o e-mail não leva dado de saúde (minimização LGPD). */
  procedure?: string;
}

export interface RecallData extends CommonData {
  dueDate: Date;
  /** Só no `wa.me`: o e-mail não leva dado de saúde (minimização LGPD). */
  reason?: string;
}

export interface ReminderData {
  confirmation: ConfirmationData;
  recall: RecallData;
}

// Fuso explícito (#205): sem ele o paciente lia "12:00" numa consulta das
// 09:00 quando o processo rodava em UTC.
const formatDay = (date: Date): string =>
  date.toLocaleDateString('pt-BR', { timeZone: appTimeZone() });

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: appTimeZone(),
  });

function confirmation(data: ConfirmationData): ReminderContent {
  const what = data.procedure ? `consulta de ${data.procedure}` : 'consulta';
  const whose = data.onBehalfOf
    ? `a ${what} de ${data.onBehalfOf}`
    : `sua ${what}`;
  const next = data.portalUrl
    ? `Confirme sua presença no portal: ${data.portalUrl}.`
    : 'Entre em contato com a clínica em caso de dúvida.';
  return {
    subject: `Lembrete de consulta — ${data.clinicName}`,
    text:
      `Olá, ${data.firstName}! Lembrete da ${data.clinicName}: ${whose} é em ` +
      `${formatDay(data.startsAt)} às ${formatTime(data.startsAt)}. ${next} Até lá!`,
  };
}

function recall(data: RecallData): ReminderContent {
  const owner = data.onBehalfOf
    ? `O retorno de ${data.onBehalfOf}`
    : 'Seu retorno';
  const what = data.reason ? `${owner} (${data.reason})` : owner;
  const next = data.portalUrl
    ? `Agende seu retorno no portal: ${data.portalUrl}.`
    : 'Entre em contato com a clínica para agendar.';
  return {
    subject: `Retorno pendente — ${data.clinicName}`,
    text:
      `Olá, ${data.firstName}! ${what} na ${data.clinicName} estava previsto para ` +
      `${formatDay(data.dueDate)}. ${next} Cuidar da continuidade faz toda a diferença!`,
  };
}

/** Texto único do lembrete: e-mail do job, link `wa.me` da recepção e dry-run. */
export function reminderContent<K extends ReminderKind>(
  kind: K,
  data: ReminderData[K],
): ReminderContent {
  return kind === 'confirmation'
    ? confirmation(data as ConfirmationData)
    : recall(data as RecallData);
}

/** Primeiro nome para a saudação. */
export const firstNameOf = (fullName: string): string =>
  fullName.trim().split(/\s+/)[0] ?? fullName;
