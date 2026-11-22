import { describe, expect, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import {
  civilDateKey,
  FUTURE_BIRTH_DATE,
  isFutureBirthDate,
  matchesNameAndBirthDate,
} from '@/domain/patient/possible-duplicates';

const civil = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Feature: possível paciente repetido (#992)', () => {
  const candidate = {
    fullName: '  JOSÉ  da Silva ',
    phone: '11988887777',
    birthDate: civil('1960-04-12'),
  };

  it('Dado o mesmo nome sem acento, caixa ou espaço a mais e o mesmo nascimento, Então casa', () => {
    expect(
      matchesNameAndBirthDate(candidate, {
        fullName: 'Jose da Silva',
        birthDate: civil('1960-04-12'),
      }),
    ).toBe(true);
  });

  it('Dado o mesmo nome com outro nascimento, Então não casa (homônimo)', () => {
    expect(
      matchesNameAndBirthDate(candidate, {
        fullName: 'José da Silva',
        birthDate: civil('1961-04-12'),
      }),
    ).toBe(false);
  });

  it('Dado outro nome com o mesmo nascimento, Então não casa', () => {
    expect(
      matchesNameAndBirthDate(candidate, {
        fullName: 'José da Silva Neto',
        birthDate: civil('1960-04-12'),
      }),
    ).toBe(false);
  });

  it.each([
    [null, civil('1960-04-12')],
    [civil('1960-04-12'), null],
  ])('Dado nascimento ausente (%s / %s), Então não casa pelo nome', (a, b) => {
    expect(
      matchesNameAndBirthDate(
        { ...candidate, birthDate: a },
        { fullName: 'José da Silva', birthDate: b },
      ),
    ).toBe(false);
  });

  it('civilDateKey devolve AAAA-MM-DD da data civil', () => {
    expect(civilDateKey(civil('2001-02-03'))).toBe('2001-02-03');
  });
});

describe('Feature: nascimento não pode ser no futuro (#992)', () => {
  // 23h de 10/03 em São Paulo já é 11/03 em UTC: o "hoje" é o da clínica.
  const now = new Date('2026-03-11T02:00:00.000Z');

  it.each([
    ['2026-03-10', false],
    ['2026-03-11', true],
    ['1990-01-01', false],
  ])('nascimento %s no dia 10/03 da clínica → futuro? %s', (iso, future) => {
    expect(isFutureBirthDate(civil(iso), now, 'America/Sao_Paulo')).toBe(
      future,
    );
  });

  it('sem `now`, usa a data de hoje', () => {
    expect(isFutureBirthDate(civil('2999-01-01'))).toBe(true);
  });

  const base = { fullName: 'Ana Lima', phone: '11977776666' };
  const future = civil('2999-01-01');

  it('Dado cadastro completo com nascimento no futuro, Então recusa', () => {
    expect(() => Patient.create({ ...base, birthDate: future })).toThrow(
      FUTURE_BIRTH_DATE,
    );
  });

  it('Dado cadastro rápido com nascimento no futuro, Então recusa', () => {
    expect(() => Patient.createQuick({ ...base, birthDate: future })).toThrow(
      FUTURE_BIRTH_DATE,
    );
  });

  it('Dado edição que muda o nascimento para o futuro, Então recusa', () => {
    const patient = Patient.create({ ...base, birthDate: civil('1990-01-01') });
    expect(() => patient.update({ birthDate: future })).toThrow(
      FUTURE_BIRTH_DATE,
    );
  });

  it('Dado nascimento legado no futuro, Quando edita outro campo ou o mantém, Então salva', () => {
    const legacy = Patient.restore({
      ...base,
      phone: '+5511977776666',
      id: 'p-legado',
      active: true,
      createdAt: new Date(),
      birthDate: future,
    });
    expect(legacy.update({ notes: 'só nota' }).birthDate).toEqual(future);
    expect(legacy.update({ birthDate: civil('2999-01-01') }).birthDate).toEqual(
      future,
    );
  });

  it('Dado edição que tira o nascimento, Então salva sem data', () => {
    const patient = Patient.create({ ...base, birthDate: civil('1990-01-01') });
    expect(patient.update({ birthDate: null }).birthDate).toBeNull();
  });
});
