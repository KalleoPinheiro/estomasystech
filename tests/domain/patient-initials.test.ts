import { describe, expect, it } from 'vitest';
import { patientInitials } from '@/domain/patient/initials';

describe('Feature: Iniciais do paciente para superfícies de terceiros (#217)', () => {
  it.each([
    ['João Silva', 'J.S.'],
    ['Maria da Silva', 'M.S.'],
    ['Ana Paula de Oliveira Santos', 'A.S.'],
    ['  josé   dos  santos ', 'J.S.'],
    ['Édson Arantes', 'É.A.'],
    ['Madonna', 'M.'],
    ['da', 'D.'],
    ['de da', 'D.D.'],
  ])('Dado "%s", Quando extrair iniciais, Então "%s"', (name, expected) => {
    expect(patientInitials(name)).toBe(expected);
  });

  it('Dado nome vazio, Quando extrair iniciais, Então null', () => {
    expect(patientInitials('   ')).toBeNull();
  });
});
