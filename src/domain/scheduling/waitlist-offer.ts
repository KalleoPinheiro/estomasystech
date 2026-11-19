import { appTimeZone } from '../shared/time-zone';

/** Janela da oferta quando a consulta está a mais de 2 horas (ADR-114, RM-16). */
export const OFFER_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Oferta em aberto para uma entrada da lista. O prazo já está decidido:
 * 2 horas, ou o início da consulta quando falta menos do que isso.
 */
export interface SlotOffer {
  appointmentId: string;
  expiresAt: Date;
  emailSentAt: Date | null;
}

/**
 * Prazo da oferta criada em `now` para uma consulta que começa em `startsAt`.
 * `null` quando a consulta já começou: não há prazo útil (ADR-114).
 */
export function offerDeadline(now: Date, startsAt: Date): Date | null {
  if (startsAt.getTime() <= now.getTime()) return null;
  return new Date(
    Math.min(now.getTime() + OFFER_WINDOW_MS, startsAt.getTime()),
  );
}

export interface WaitlistOfferContent {
  subject: string;
  text: string;
}

export interface WaitlistOfferContentData {
  firstName: string;
  clinicName: string;
  startsAt: Date;
  expiresAt: Date;
  /** Primeiro nome do paciente quando quem recebe é o responsável. */
  onBehalfOf?: string;
}

const formatDay = (date: Date): string =>
  date.toLocaleDateString('pt-BR', { timeZone: appTimeZone() });

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: appTimeZone(),
  });

/**
 * E-mail da vaga. Sem procedimento nem outro dado clínico: o mesmo recorte
 * dos lembretes (minimização). A equipe marca a consulta; o texto não promete
 * agendamento automático (AGE-RN-08).
 */
export function waitlistOfferContent(
  data: WaitlistOfferContentData,
): WaitlistOfferContent {
  const who = data.onBehalfOf ? `para ${data.onBehalfOf}` : 'para você';
  const when = `${formatDay(data.startsAt)} às ${formatTime(data.startsAt)}`;
  const until = `${formatDay(data.expiresAt)} às ${formatTime(data.expiresAt)}`;
  return {
    subject: `Horário disponível — ${data.clinicName}`,
    text:
      `Olá, ${data.firstName}! A ${data.clinicName} tem um horário ${who} em ${when}. ` +
      `Esta oferta vale até ${until}. Para ocupar a vaga, fale com a clínica. ` +
      'Se não houver resposta até lá, ela passa para a próxima pessoa da lista de espera.',
  };
}
