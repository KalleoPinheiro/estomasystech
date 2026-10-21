import { describe, expect, it } from 'vitest';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';

describe('Feature: Quem mexe na logo e no avatar (#427)', () => {
  it('Dado o envio da logo, Quando classificar, Então é administrativo: só o Admin de Empresa', () => {
    const family = classifyRoute('/api/settings/clinic-logo');

    expect(family).toBe('administrative');
    expect(isFamilyAllowedForRole(family, 'company_admin')).toBe(true);
    expect(isFamilyAllowedForRole(family, 'atendente')).toBe(false);
    expect(isFamilyAllowedForRole(family, 'profissional')).toBe(false);
  });

  it.each(['/api/clinic/logo', '/api/account/avatar', '/api/account/avatar/x'])(
    'Dada a rota %s, Quando classificar, Então toda a equipe da clínica entra, e paciente não',
    (path) => {
      const family = classifyRoute(path);

      expect(isFamilyAllowedForRole(family, 'atendente')).toBe(true);
      expect(isFamilyAllowedForRole(family, 'patient')).toBe(false);
      expect(isFamilyAllowedForRole(family, 'super_admin')).toBe(false);
    },
  );
});

describe('Feature: Quem muda o tema da clínica (#426)', () => {
  it('Dado a troca de tema, Quando classificar, Então é administrativa: só o Admin de Empresa', () => {
    const family = classifyRoute('/api/settings/clinic-identity');

    expect(family).toBe('administrative');
    expect(isFamilyAllowedForRole(family, 'company_admin')).toBe(true);
    expect(isFamilyAllowedForRole(family, 'atendente')).toBe(false);
    expect(isFamilyAllowedForRole(family, 'profissional')).toBe(false);
  });
});
