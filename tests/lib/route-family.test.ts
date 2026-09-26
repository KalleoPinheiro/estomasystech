import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/domain/auth/user-role';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';

describe('Feature: Classificação de rota por família (RBAC-05)', () => {
  describe('Cenário: classificação de pathname', () => {
    it.each([
      ['/portal', 'shared'],
      ['/api/portal/me', 'shared'],
      ['/api/auth/logout', 'shared'],
      ['/api/patients/abc/evolutions', 'clinical'],
      ['/api/patients/abc/conditions', 'clinical'],
      ['/api/patients/abc/anamnesis', 'clinical'],
      ['/api/patients/abc/care-plans', 'clinical'],
      ['/api/patients/abc/export', 'clinical'],
      ['/api/conditions/abc', 'clinical'],
      ['/api/photos/abc', 'clinical'],
      ['/api/care-plans', 'clinical'],
      ['/api/care-plan-interventions', 'clinical'],
      ['/api/appointments', 'operational'],
      ['/api/patients', 'operational'],
      ['/api/patients/abc', 'operational'],
      ['/api/partners', 'operational'],
      ['/api/follow-ups', 'operational'],
      ['/api/settings/schedule', 'operational'],
      ['/api/accounts', 'operational'],
      ['/api/professionals', 'administrative'],
      ['/api/supplies', 'administrative'],
      ['/api/reports', 'administrative'],
      ['/api/audit', 'administrative'],
      ['/api/commission-payouts', 'administrative'],
      ['/api/my-payouts', 'professional_self'],
    ] as const)(
      'Dado o pathname %s, Quando classificar, Então família %s',
      (pathname, family) => {
        expect(classifyRoute(pathname)).toBe(family);
      },
    );
  });

  describe('Cenário: subrotas de paciente fail-closed (#185)', () => {
    it.each([
      ['/api/patients/abc/nova-subrota', 'clinical'],
      ['/api/patients/abc/export/extra', 'clinical'],
      ['/api/patients/abc/', 'clinical'],
      ['/api/patients', 'operational'],
      ['/api/patients/abc', 'operational'],
      ['/api/patients/conditions-report', 'operational'],
    ] as const)(
      'Dado o pathname %s, Quando classificar, Então família %s',
      (pathname, family) => {
        expect(classifyRoute(pathname)).toBe(family);
      },
    );
  });

  describe('Cenário: matriz papel × família', () => {
    const expected: Record<UserRole, Record<string, boolean>> = {
      super_admin: {
        shared: true,
        operational: true,
        clinical: true,
        administrative: true,
      },
      company_admin: {
        shared: true,
        operational: true,
        clinical: true,
        administrative: true,
      },
      atendente: {
        shared: true,
        operational: true,
        clinical: false,
        administrative: false,
      },
      profissional: {
        shared: true,
        operational: true,
        clinical: true,
        administrative: false,
      },
      patient: {
        shared: true,
        operational: false,
        clinical: false,
        administrative: false,
      },
      partner: {
        shared: true,
        operational: false,
        clinical: false,
        administrative: false,
      },
    };

    for (const role of USER_ROLES) {
      for (const family of [
        'shared',
        'operational',
        'clinical',
        'administrative',
      ] as const) {
        it(`Dado papel ${role} e família ${family}, Quando checar, Então ${expected[role][family]}`, () => {
          expect(isFamilyAllowedForRole(family, role)).toBe(
            expected[role][family],
          );
        });
      }
    }
  });
});
