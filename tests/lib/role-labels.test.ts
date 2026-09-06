import { describe, expect, it } from 'vitest';
import { staffRoleLabel } from '@/lib/auth/role-labels';

describe('Feature: Rótulo de papel na sidebar (issue #126)', () => {
  it('Dado papel de equipe conhecido, Quando staffRoleLabel, Então retorna o rótulo legível', () => {
    expect(staffRoleLabel('company_admin')).toBe('Admin de Empresa');
    expect(staffRoleLabel('super_admin')).toBe('Super Admin');
    expect(staffRoleLabel('atendente')).toBe('Atendente');
    expect(staffRoleLabel('profissional')).toBe('Profissional');
  });

  it('Dado papel fora do mapa de rótulos de equipe (patient/partner, nunca chegam na sidebar mas o tipo permite), Quando staffRoleLabel, Então cai pro valor bruto do papel', () => {
    expect(staffRoleLabel('patient')).toBe('patient');
    expect(staffRoleLabel('partner')).toBe('partner');
  });
});
