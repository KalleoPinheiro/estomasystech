import { appTimeZone, zonedParts } from '../shared/time-zone';

/** Maioridade civil (CC, art. 5º): aos 18 anos o titular responde pelos próprios dados (LGPD, art. 14). */
export const AGE_OF_MAJORITY = 18;

/**
 * Último nascimento que já é maior de idade em `now`: meia-noite UTC do dia de
 * hoje (no fuso da aplicação) há 18 anos. A data de nascimento é gravada como
 * meia-noite UTC do dia civil, então a comparação é exata. Quem nasceu em 29/2
 * fica maior em 1º/3 nos anos não bissextos (`Date.UTC` normaliza; CC, art.
 * 132, § 3º). Mesma regra do filtro em SQL, que recebe este instante.
 */
export function majorityBirthCutoff(
  now: Date = new Date(),
  timeZone: string = appTimeZone(),
): Date {
  const today = zonedParts(now, timeZone);
  return new Date(
    Date.UTC(today.year - AGE_OF_MAJORITY, today.month - 1, today.day),
  );
}

/**
 * Menor de idade em `now`? Sem data de nascimento não há como saber: vale como
 * adulto, que é como o portal funcionava antes (#372). A clínica precisa
 * informar a data para o portal tratar o paciente como menor.
 */
export function isMinorOn(
  birthDate: Date | null | undefined,
  now: Date = new Date(),
  timeZone: string = appTimeZone(),
): boolean {
  if (!birthDate) return false;
  return birthDate.getTime() > majorityBirthCutoff(now, timeZone).getTime();
}

/**
 * Prazo do aceite feito pelo representante legal depois dos 18 anos (#375,
 * ADR-033): 90 dias para o paciente aceitar em nome próprio, sem interromper o
 * curativo; depois disso o aceite do representante não vale mais.
 */
export const REPRESENTATIVE_CONSENT_GRACE_DAYS = 90;

/** Dia (meia-noite UTC do dia civil) em que o paciente fica maior de idade. */
export function majorityDate(birthDate: Date): Date {
  return new Date(
    Date.UTC(
      birthDate.getUTCFullYear() + AGE_OF_MAJORITY,
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(),
    ),
  );
}

/**
 * Primeiro dia em que o aceite do representante já não vale: 90 dias depois
 * do aniversário de 18 anos. Até a véspera, ainda vale.
 */
export function representativeConsentExpiresOn(birthDate: Date): Date {
  const majority = majorityDate(birthDate);
  return new Date(
    Date.UTC(
      majority.getUTCFullYear(),
      majority.getUTCMonth(),
      majority.getUTCDate() + REPRESENTATIVE_CONSENT_GRACE_DAYS,
    ),
  );
}

/**
 * O aceite do representante venceu em `now`? Sem data de nascimento não há
 * como provar que o titular ainda é menor ou está no prazo: venceu (falha
 * fechada; o representante só assina por menor com data informada).
 */
export function isRepresentativeConsentExpired(
  birthDate: Date | null | undefined,
  now: Date = new Date(),
  timeZone: string = appTimeZone(),
): boolean {
  if (!birthDate) return true;
  const today = zonedParts(now, timeZone);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return todayUtc >= representativeConsentExpiresOn(birthDate).getTime();
}

/** Titular do aceite, para decidir se o aceite do representante ainda vale. */
export interface ConsentHolder {
  birthDate: Date | null;
}
