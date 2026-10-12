/**
 * Prazos de retenção por tipo de dado (#294, decisão de 2026-10-11). Ao fim
 * do prazo o dado é anonimizado, nunca excluído.
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
 * Corte de um prazo: a mesma data e hora `years` anos antes (calendário UTC).
 * 29/02 sem par no ano do corte vira 28/02 — o corte mais cedo, que anonimiza
 * menos. Só entra quem tem referência estritamente anterior ao corte.
 */
export function retentionCutoff(now: Date, years: number): Date {
  const cutoff = new Date(now.getTime());
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff;
}

/** Cortes de todos os tipos para uma execução. */
export function retentionCutoffs(now: Date): Record<RetentionKind, Date> {
  return {
    clinicalRecord: retentionCutoff(now, RETENTION_YEARS.clinicalRecord),
    auditTrail: retentionCutoff(now, RETENTION_YEARS.auditTrail),
    waitlist: retentionCutoff(now, RETENTION_YEARS.waitlist),
    inactiveAccount: retentionCutoff(now, RETENTION_YEARS.inactiveAccount),
  };
}
