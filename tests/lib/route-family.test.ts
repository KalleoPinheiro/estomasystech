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
      // #215: editar a grade é do Admin; feriados/ausências e a leitura da
      // grade pela agenda seguem abertos à equipe.
      ['/api/settings/schedule', 'administrative'],
      ['/api/settings/schedule/closures', 'operational'],
      ['/api/settings/schedule/closures/c-1', 'operational'],
      ['/api/schedule-config', 'operational'],
      ['/api/accounts', 'operational'],
      ['/api/professionals', 'administrative'],
      ['/api/supplies', 'administrative'],
      ['/api/reports', 'administrative'],
      ['/api/audit', 'administrative'],
      ['/api/commission-payouts', 'administrative'],
      ['/api/my-payouts', 'professional_self'],
      ['/api/options/professionals', 'operational'],
      ['/api/options/procedures', 'operational'],
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

  it('taxonomia é clínica e a importação é de plataforma', () => {
    expect(classifyRoute('/api/taxonomy/diagnoses')).toBe('clinical');
    expect(classifyRoute('/api/taxonomy/outcomes')).toBe('clinical');
    expect(classifyRoute('/api/taxonomy/interventions')).toBe('clinical');
    expect(classifyRoute('/api/taxonomy/diagnoses/00046/linked-terms')).toBe(
      'clinical',
    );
    expect(classifyRoute('/api/platform/taxonomy/import')).toBe('platform');
  });

  it('reset-link de conta é administrativo; o resto de /api/accounts segue operacional (C2, #265)', () => {
    expect(classifyRoute('/api/accounts/acc-1/reset-link')).toBe(
      'administrative',
    );
    expect(classifyRoute('/api/accounts/acc-1/resend-invite')).toBe(
      'operational',
    );
    expect(classifyRoute('/api/accounts/acc-1')).toBe('operational');
    expect(classifyRoute('/api/accounts/acc-1/reset-link/x')).toBe(
      'operational',
    );
  });

  it('email-channel: canal de e-mail da clínica é administrativo, inclusive o teste (C3, #266)', () => {
    expect(classifyRoute('/api/settings/email-channel')).toBe('administrative');
    expect(classifyRoute('/api/settings/email-channel/test')).toBe(
      'administrative',
    );
  });

  describe('Cenário: família platform (ADR-007)', () => {
    it.each([
      ['/plataforma', 'platform'],
      ['/plataforma/clinicas', 'platform'],
      ['/api/platform', 'platform'],
      ['/api/platform/clinics/x/admins', 'platform'],
      ['/plataformas', 'operational'],
      ['/api/platformx', 'operational'],
    ] as const)(
      'Dado o pathname %s, Quando classificar, Então família %s',
      (pathname, family) => {
        expect(classifyRoute(pathname)).toBe(family);
      },
    );
  });

  describe('Cenário: matriz papel × família', () => {
    const FAMILIES = [
      'shared',
      'operational',
      'clinical',
      'administrative',
      'professional_self',
      'platform',
    ] as const;
    type Family = (typeof FAMILIES)[number];
    // Os 5 papéis de empresa mantêm as famílias anteriores ao B1; o super_admin
    // só tem `shared` (logout/portal) e `platform` (ADR-007).
    const expected: Record<UserRole, Record<Family, boolean>> = {
      super_admin: {
        shared: true,
        operational: false,
        clinical: false,
        administrative: false,
        professional_self: false,
        platform: true,
      },
      company_admin: {
        shared: true,
        operational: true,
        clinical: true,
        administrative: true,
        professional_self: true,
        platform: false,
      },
      atendente: {
        shared: true,
        operational: true,
        clinical: false,
        administrative: false,
        professional_self: false,
        platform: false,
      },
      profissional: {
        shared: true,
        operational: true,
        clinical: true,
        administrative: false,
        professional_self: true,
        platform: false,
      },
      patient: {
        shared: true,
        operational: false,
        clinical: false,
        administrative: false,
        professional_self: false,
        platform: false,
      },
      partner: {
        shared: true,
        operational: false,
        clinical: false,
        administrative: false,
        professional_self: false,
        platform: false,
      },
    };

    for (const role of USER_ROLES) {
      for (const family of FAMILIES) {
        it(`Dado papel ${role} e família ${family}, Quando checar, Então ${expected[role][family]}`, () => {
          expect(isFamilyAllowedForRole(family, role)).toBe(
            expected[role][family],
          );
        });
      }
    }
  });
});
