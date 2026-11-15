import { describe, expect, it } from 'vitest';
import {
  comparePatientEntries,
  normalizeSearchText,
  selectPatientPage,
} from '@/domain/patient/patient-search';

const ENTRIES = [
  { id: 'c', fullName: 'Zélia Souza' },
  { id: 'a', fullName: 'José da Silva' },
  { id: 'b', fullName: 'jose Alves' },
  { id: 'd', fullName: 'Ana Maria' },
];

const pick = (...args: Parameters<typeof selectPatientPage>) =>
  selectPatientPage(...args).map((entry) => entry.id);

describe('normalizeSearchText', () => {
  it('ignora acento, caixa e espaços repetidos', () => {
    expect(normalizeSearchText('  JOSÉ   da  Silva ')).toBe('jose da silva');
  });
});

describe('comparePatientEntries', () => {
  it('ordena pelo nome normalizado e desempata pelo id', () => {
    const sorted = [...ENTRIES].sort(comparePatientEntries).map((e) => e.id);
    expect(sorted).toEqual(['d', 'b', 'a', 'c']);
    expect(
      comparePatientEntries(
        { id: '1', fullName: 'Ana' },
        { id: '2', fullName: 'ana' },
      ),
    ).toBeLessThan(0);
    expect(
      comparePatientEntries(
        { id: '2', fullName: 'Ana' },
        { id: '1', fullName: 'ana' },
      ),
    ).toBeGreaterThan(0);
    expect(
      comparePatientEntries(
        { id: '1', fullName: 'Ana' },
        { id: '1', fullName: 'ANA' },
      ),
    ).toBe(0);
  });
});

describe('selectPatientPage', () => {
  it('sem termo devolve todos na ordem da listagem, respeitando o limite', () => {
    expect(pick(ENTRIES, { limit: 10 })).toEqual(['d', 'b', 'a', 'c']);
    expect(pick(ENTRIES, { limit: 2 })).toEqual(['d', 'b']);
  });

  it('"jose" acha "José" e "jose" por trecho, sem acento nem caixa', () => {
    expect(pick(ENTRIES, { term: 'jose', limit: 10 })).toEqual(['b', 'a']);
    expect(pick(ENTRIES, { term: 'ÉLIA', limit: 10 })).toEqual(['c']);
  });

  it('termo só de espaços não filtra', () => {
    expect(pick(ENTRIES, { term: '   ', limit: 10 })).toHaveLength(4);
  });

  it('ids achados por índice cego entram mesmo sem casar o nome', () => {
    expect(
      pick(ENTRIES, {
        term: '52998224725',
        matchedIds: new Set(['c']),
        limit: 10,
      }),
    ).toEqual(['c']);
  });

  it('retoma depois do cursor, sem repetir nem pular itens', () => {
    const first = pick(ENTRIES, { limit: 2 });
    const second = pick(ENTRIES, {
      limit: 2,
      cursorId: first[first.length - 1],
    });
    expect(second).toEqual(['a', 'c']);
    expect(pick(ENTRIES, { limit: 2, cursorId: 'c' })).toEqual([]);
  });

  it('cursor que não aponta mais para um item encerra a paginação', () => {
    expect(pick(ENTRIES, { limit: 2, cursorId: 'sumiu' })).toEqual([]);
  });
});
