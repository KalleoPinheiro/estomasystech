import { describe, expect, it } from 'vitest';
import {
  canRepresentMinor,
  GUARDIAN_RELATIONSHIPS,
} from '@/domain/guardian/guardian';
import { isMinorOn, majorityBirthCutoff } from '@/domain/patient/majority';
import { Patient } from '@/domain/patient/patient';

const TZ = 'America/Sao_Paulo';
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Meio-dia em Brasília do dia civil dado. */
const noonBrasilia = (iso: string) => new Date(`${iso}T15:00:00Z`);

describe('Feature: maioridade do paciente (#372)', () => {
  it('Dado nascimento há exatamente 18 anos, Então já é maior; um dia depois, ainda menor', () => {
    const now = noonBrasilia('2026-10-18');
    expect(isMinorOn(day('2008-10-18'), now, TZ)).toBe(false);
    expect(isMinorOn(day('2008-10-19'), now, TZ)).toBe(true);
  });

  it('Dado o fim do dia em Brasília (já amanhã em UTC), Então o aniversário de amanhã ainda não conta', () => {
    const lateNight = new Date('2026-10-19T01:30:00Z'); // 22h30 de 18/10 em Brasília
    expect(isMinorOn(day('2008-10-19'), lateNight, TZ)).toBe(true);
  });

  it('Dado nascido em 29/2, Então fica maior em 1º/3 no ano não bissexto', () => {
    expect(isMinorOn(day('2008-02-29'), noonBrasilia('2026-02-28'), TZ)).toBe(
      true,
    );
    expect(isMinorOn(day('2008-02-29'), noonBrasilia('2026-03-01'), TZ)).toBe(
      false,
    );
  });

  it('Dado paciente sem data de nascimento, Então vale como adulto', () => {
    expect(isMinorOn(null)).toBe(false);
    expect(isMinorOn(undefined)).toBe(false);
  });

  it('Então o corte é a meia-noite UTC do mesmo dia, 18 anos antes', () => {
    expect(majorityBirthCutoff(noonBrasilia('2026-10-18'), TZ)).toEqual(
      day('2008-10-18'),
    );
  });

  it('Dado o parentesco, Então só mãe, pai e representante legal representam o menor', () => {
    expect(GUARDIAN_RELATIONSHIPS.filter(canRepresentMinor)).toEqual([
      'mae',
      'pai',
      'representante_legal',
    ]);
  });

  it('Dada a decisão de manter com o responsável, Quando troca o responsável, Então a marca zera', () => {
    const patient = Patient.create({
      fullName: 'Ana Souza',
      phone: '11999990000',
      birthDate: day('2000-01-01'),
      guardianId: 'g-1',
    });
    const now = new Date('2026-10-18T12:00:00Z');
    const reviewed = patient.markMajorityReviewed(now);
    expect(reviewed.majorityReviewedAt).toEqual(now);
    expect(reviewed.update({ notes: 'x' }).majorityReviewedAt).toEqual(now);
    expect(
      reviewed.update({ guardianId: 'g-2' }).majorityReviewedAt,
    ).toBeNull();
    expect(patient.majorityReviewedAt).toBeNull();
    expect(reviewed.isMinorOn(now)).toBe(false);
  });
});
