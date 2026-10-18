import {
  appTimeZone,
  startOfZonedDay,
  zonedParts,
} from '@/domain/shared/time-zone';

/**
 * Prazos de retenção por tipo de dado (#294, decisão de 2026-10-11). Ao fim
 * do prazo o dado é anonimizado, nunca excluído. Fonte única (#323): o aviso de
 * privacidade lê estes números; mudar um deles exige subir a versão do aviso
 * (`PRIVACY_NOTICE_VERSION`), e o teste do aviso falha até isso acontecer.
 */
export const RETENTION_YEARS = {
  /** Prontuário e fotos, contados da última atividade clínica do paciente. */
  clinicalRecord: 20,
  auditTrail: 5,
  waitlist: 2,
  /** Contas da equipe e do paciente, contados da desativação. */
  inactiveAccount: 2,
} as const;

export type RetentionKind = keyof typeof RETENTION_YEARS;

/** Marcador de ator/recurso de evento de auditoria anonimizado. */
export const ANONYMIZED_MARKER = 'anonimizado';

export const ANONYMIZED_PATIENT_NAME = 'Paciente anonimizado';
export const ANONYMIZED_CONDITION_TITLE = 'Condição anonimizada';
export const ANONYMIZED_INVOICE_DESCRIPTION = 'Fatura anonimizada';

/**
 * Hash de senha de conta anonimizada: formato aceito pelo domínio, custo `0`
 * fora da faixa de `verifyPassword` — nenhuma senha o satisfaz.
 */
export const ANONYMIZED_PASSWORD_HASH = 'scrypt$0$anonimizado$anonimizado';

/** E-mail de substituição, único por registro (os índices são por empresa). */
export function anonymizedEmail(id: string): string {
  return `anonimizado+${id}@anonimizado.invalid`;
}

/**
 * Corte de um prazo em dias inteiros, no fuso da aplicação (#323, ADR-031).
 * O prazo em anos termina no dia de igual número do de início, ou no seguinte
 * quando ele falta (Código Civil, art. 132, § 3º), e o último dia conta
 * inteiro. Então, numa execução no dia `D`, só sai quem tem referência num dia
 * cujo prazo terminou antes de `D`: o corte é a meia-noite local do dia seguinte
 * a "ontem menos `years` anos" (29/02 sem par vira 28/02). Entra quem tem
 * referência estritamente anterior ao corte.
 */
export function retentionCutoff(
  now: Date,
  years: number,
  timeZone: string = appTimeZone(),
): Date {
  const today = zonedParts(now, timeZone);
  const yesterday = new Date(
    Date.UTC(today.year, today.month - 1, today.day - 1),
  );
  const year = yesterday.getUTCFullYear() - years;
  const month = yesterday.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(yesterday.getUTCDate(), lastDay);
  return startOfZonedDay(year, month + 1, day + 1, timeZone);
}

/** Cortes de todos os tipos para uma execução. */
export function retentionCutoffs(
  now: Date,
  timeZone: string = appTimeZone(),
): Record<RetentionKind, Date> {
  return {
    clinicalRecord: retentionCutoff(
      now,
      RETENTION_YEARS.clinicalRecord,
      timeZone,
    ),
    auditTrail: retentionCutoff(now, RETENTION_YEARS.auditTrail, timeZone),
    waitlist: retentionCutoff(now, RETENTION_YEARS.waitlist, timeZone),
    inactiveAccount: retentionCutoff(
      now,
      RETENTION_YEARS.inactiveAccount,
      timeZone,
    ),
  };
}
