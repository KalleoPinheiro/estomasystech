import { describe, expect, it } from 'vitest';
import { canProvision } from '@/domain/auth/role-hierarchy';
import { USER_ROLES, type UserRole } from '@/domain/auth/user-role';

/** Matriz completa esperada (RBAC-07..RBAC-10, ADR-003) — 36 pares ator×alvo. */
const EXPECTED: Record<UserRole, Record<UserRole, boolean>> = {
  super_admin: {
    super_admin: false,
    company_admin: true,
    atendente: false,
    profissional: false,
    patient: false,
    partner: false,
  },
  company_admin: {
    super_admin: false,
    company_admin: true,
    atendente: true,
    profissional: true,
    patient: true,
    partner: true,
  },
  atendente: {
    super_admin: false,
    company_admin: false,
    atendente: false,
    profissional: false,
    patient: true,
    partner: true,
  },
  profissional: {
    super_admin: false,
    company_admin: false,
    atendente: false,
    profissional: false,
    patient: true,
    partner: true,
  },
  patient: {
    super_admin: false,
    company_admin: false,
    atendente: false,
    profissional: false,
    patient: false,
    partner: false,
  },
  partner: {
    super_admin: false,
    company_admin: false,
    atendente: false,
    profissional: false,
    patient: false,
    partner: false,
  },
};

describe('Feature: Hierarquia de provisionamento de contas (RBAC-07..RBAC-10)', () => {
  for (const actor of USER_ROLES) {
    for (const target of USER_ROLES) {
      const expected = EXPECTED[actor][target];
      it(`Dado ator ${actor} e alvo ${target}, Quando canProvision, Então ${expected}`, () => {
        expect(canProvision(actor, target)).toBe(expected);
      });
    }
  }

  describe('Cenário: só existe um super_admin (ADR-007)', () => {
    it('Dado qualquer ator, Quando checar alvo super_admin, Então nenhum papel provisiona super_admin', () => {
      for (const actor of USER_ROLES) {
        expect(canProvision(actor, 'super_admin')).toBe(false);
      }
    });
  });

  describe('Cenário: patient e partner nunca cadastram ninguém (RBAC-10)', () => {
    it('Dado ator patient, Quando checar qualquer alvo, Então sempre false', () => {
      for (const target of USER_ROLES) {
        expect(canProvision('patient', target)).toBe(false);
      }
    });

    it('Dado ator partner, Quando checar qualquer alvo, Então sempre false', () => {
      for (const target of USER_ROLES) {
        expect(canProvision('partner', target)).toBe(false);
      }
    });
  });
});
