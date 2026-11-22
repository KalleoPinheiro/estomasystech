import { appTimeZone, zonedDateKey } from '../shared/time-zone';
import { normalizeSearchText } from './patient-search';

/**
 * Possível paciente repetido (#992). O cadastro não é bloqueado: homônimos e
 * familiares que dividem o celular existem. Antes de criar, a equipe vê quem
 * já está cadastrado com o mesmo celular, ou com o mesmo nome e a mesma data de
 * nascimento, e escolhe usar esse paciente ou cadastrar mesmo assim.
 */
export interface DuplicateCandidate {
  fullName: string;
  phone: string;
  /** Data civil à meia-noite UTC (ADR-073); sem ela só o celular compara. */
  birthDate: Date | null;
}

/** Aviso curto: mais do que isso deixa de ajudar a decidir. */
export const MAX_POSSIBLE_DUPLICATES = 5;

/** Chave `AAAA-MM-DD` de uma data civil (meia-noite UTC). */
export function civilDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Mesmo nome (sem acento, caixa ou espaço a mais) e mesma data de nascimento. */
export function matchesNameAndBirthDate(
  candidate: DuplicateCandidate,
  patient: { fullName: string; birthDate: Date | null },
): boolean {
  if (candidate.birthDate === null || patient.birthDate === null) return false;
  return (
    civilDateKey(candidate.birthDate) === civilDateKey(patient.birthDate) &&
    normalizeSearchText(candidate.fullName) ===
      normalizeSearchText(patient.fullName)
  );
}

export const FUTURE_BIRTH_DATE = 'A data de nascimento não pode ser no futuro.';

/** Nascimento depois de hoje, no fuso da clínica (#992). */
export function isFutureBirthDate(
  birthDate: Date,
  now: Date = new Date(),
  timeZone: string = appTimeZone(),
): boolean {
  return civilDateKey(birthDate) > zonedDateKey(now, timeZone);
}
