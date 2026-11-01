import { describe, expect, it } from 'vitest';
import {
  auditFiltersFrom,
  auditFiltersToSearch,
  auditRangeFrom,
  validDateParam,
  validPageSize,
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
        por: '50',
        cursor: 'c1',
      }),
    ).toEqual({
      patientId: 'p1',
      from: '2026-01-01',
      to: '',
      size: 50,
      cursor: 'c1',
    });
    expect(auditFiltersFrom(undefined)).toEqual({
      patientId: '',
      from: '',
      to: '',
      size: 25,
      cursor: '',
    });
  });

  it('Dado ?por= fora da lista, Quando ler, Então volta para 25', () => {
    expect(validPageSize('50')).toBe(50);
    expect(validPageSize('25')).toBe(25);
    for (const bad of ['100', '0', '-25', 'abc', '', null, undefined]) {
      expect(validPageSize(bad)).toBe(25);
    }
  });

  it('Dado filtros, Quando montar a query, Então só entram os preenchidos', () => {
    expect(
      auditFiltersToSearch({
        patientId: 'p1',
        from: '2026-01-01',
        to: '2026-01-31',
        size: 50,
        cursor: 'c1',
      }),
    ).toBe('paciente=p1&de=2026-01-01&ate=2026-01-31&por=50&cursor=c1');
    expect(auditFiltersToSearch({ size: 25 })).toBe('');
    expect(auditFiltersToSearch({})).toBe('');
  });

  it('Dado dia civil, Quando montar o intervalo, Então vai do início do dia ao último milissegundo', () => {
    const range = auditRangeFrom({
      patientId: '',
      from: '2026-01-01',
      to: '2026-01-31',
      size: 25,
      cursor: '',
    });
    expect(range.from?.getTime()).toBeLessThan(range.to?.getTime() ?? 0);
    expect(
      auditRangeFrom({ patientId: '', from: '', to: '', size: 25, cursor: '' }),
    ).toEqual({
      from: undefined,
      to: undefined,
    });
  });
});
