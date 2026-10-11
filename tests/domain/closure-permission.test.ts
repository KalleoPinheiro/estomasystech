import { describe, expect, it } from 'vitest';
import {
  assertCanManageClosure,
  canManageClosure,
} from '@/domain/scheduling/closure-permission';
import { ForbiddenError } from '@/domain/shared/errors';

const admin = { role: 'company_admin', professionalId: null } as const;
const atendente = { role: 'atendente', professionalId: null } as const;
const ana = { role: 'profissional', professionalId: 'prof-ana' } as const;
const semVinculo = { role: 'profissional', professionalId: null } as const;

describe('Feature: Quem gerencia feriados e ausências (#215, AGE-RN-13)', () => {
  it.each([
    ['company_admin', admin],
    ['atendente', atendente],
  ])(
    'Dado %s, Quando gerencia feriado ou ausência de qualquer profissional, Então pode',
    (_, actor) => {
      expect(canManageClosure(actor, null)).toBe(true);
      expect(canManageClosure(actor, 'prof-bia')).toBe(true);
    },
  );

  it('Dado Profissional, Quando gerencia a própria ausência, Então pode; feriado ou ausência de colega, não', () => {
    expect(canManageClosure(ana, 'prof-ana')).toBe(true);
    expect(canManageClosure(ana, null)).toBe(false);
    expect(canManageClosure(ana, 'prof-bia')).toBe(false);
  });

  it('Dado Profissional sem vínculo, Quando gerencia qualquer bloqueio, Então não pode', () => {
    expect(canManageClosure(semVinculo, null)).toBe(false);
    expect(canManageClosure(semVinculo, 'prof-ana')).toBe(false);
  });

  it('Dado papel fora da equipe da clínica, Quando gerencia, Então não pode', () => {
    expect(
      canManageClosure({ role: 'super_admin', professionalId: null }, null),
    ).toBe(false);
  });

  it('Dado modo aberto (sem ator), Quando gerencia, Então não restringe', () => {
    expect(canManageClosure(null, null)).toBe(true);
  });

  it('Dado ator sem permissão, Quando assert, Então ForbiddenError; com permissão, passa', () => {
    expect(() => assertCanManageClosure(ana, null)).toThrow(ForbiddenError);
    expect(() => assertCanManageClosure(ana, 'prof-ana')).not.toThrow();
  });
});
