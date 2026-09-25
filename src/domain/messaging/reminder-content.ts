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

const formatDay = (date: Date): string => date.toLocaleDateString('pt-BR');

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function confirmation(data: ConfirmationData): ReminderContent {
  const what = data.procedure ? `consulta de ${data.procedure}` : 'consulta';
  const next = data.portalUrl
    ? `Confirme sua presença no portal: ${data.portalUrl}.`
    : 'Entre em contato com a clínica em caso de dúvida.';
  return {
    subject: `Lembrete de consulta — ${data.clinicName}`,
    text:
      `Olá, ${data.firstName}! Lembrete da ${data.clinicName}: sua ${what} é em ` +
      `${formatDay(data.startsAt)} às ${formatTime(data.startsAt)}. ${next} Até lá!`,
  };
}

function recall(data: RecallData): ReminderContent {
  const what = data.reason ? `Seu retorno (${data.reason})` : 'Seu retorno';
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
