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
