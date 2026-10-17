import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/domain/auth/user-role';

describe('Feature: Catálogo de 7 papéis (RBAC-01, ADR-027)', () => {
  it('Dado o catálogo de papéis, Quando listado, Então contém exatamente os 7 valores fixos', () => {
    expect(USER_ROLES).toEqual([
      'super_admin',
      'company_admin',
      'atendente',
      'profissional',
      'patient',
      'partner',
      'guardian',
    ]);
  });

  it("Dado o papel legado 'admin', Quando comparado ao catálogo, Então não é mais um UserRole válido", () => {
    const roles: readonly string[] = USER_ROLES;
    expect(roles.includes('admin')).toBe(false);
  });

  it('Dado cada valor do catálogo, Quando usado como UserRole, Então é aceito pelo tipo', () => {
    const sample: UserRole[] = [...USER_ROLES];
    expect(sample).toHaveLength(7);
  });
});
