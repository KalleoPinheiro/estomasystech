import { describe, expect, it } from 'vitest';
import {
  auditFiltersFrom,
  auditFiltersToSearch,
  auditRangeFrom,
  validDateParam,
} from '@/lib/audit-filters';

describe('Feature: filtros da Auditoria na URL (#555)', () => {
  it('Dado data existente, Quando validar, Então mantém; inexistente ou malformada vira vazio', () => {
    expect(validDateParam('2026-01-31')).toBe('2026-01-31');
    expect(validDateParam('2027-02-31')).toBe('');
    expect(validDateParam('abc')).toBe('');
    expect(validDateParam(null)).toBe('');
    expect(validDateParam(undefined)).toBe('');
  });

  it('Dado searchParams, Quando ler, Então devolve os filtros válidos e usa o primeiro valor repetido', () => {
    expect(
      auditFiltersFrom({
        paciente: ['p1', 'p2'],
        de: '2026-01-01',
        ate: '2026-13-45',
        cursor: 'c1',
      }),
    ).toEqual({ patientId: 'p1', from: '2026-01-01', to: '', cursor: 'c1' });
    expect(auditFiltersFrom(undefined)).toEqual({
      patientId: '',
      from: '',
      to: '',
      cursor: '',
    });
  });

  it('Dado filtros, Quando montar a query, Então só entram os preenchidos', () => {
    expect(
      auditFiltersToSearch({
        patientId: 'p1',
        from: '2026-01-01',
        to: '2026-01-31',
        cursor: 'c1',
      }),
    ).toBe('paciente=p1&de=2026-01-01&ate=2026-01-31&cursor=c1');
    expect(auditFiltersToSearch({})).toBe('');
  });

  it('Dado dia civil, Quando montar o intervalo, Então vai do início do dia ao último milissegundo', () => {
    const range = auditRangeFrom({
      patientId: '',
      from: '2026-01-01',
      to: '2026-01-31',
      cursor: '',
    });
    expect(range.from?.getTime()).toBeLessThan(range.to?.getTime() ?? 0);
    expect(
      auditRangeFrom({ patientId: '', from: '', to: '', cursor: '' }),
    ).toEqual({
      from: undefined,
      to: undefined,
    });
  });
});
