import { describe, expect, it } from 'vitest';
import {
  abbreviatePatientName,
  homonymPatientIds,
  listPatientName,
} from '@/lib/patient-name';

describe('Feature: nome do paciente abreviado nas listas (CONTEXT.md)', () => {
  it.each([
    ['Mateus Paulo Costa Silva', 'Mateus P. C. Silva'],
    ['Maria Souza', 'Maria Souza'],
    ['Maria', 'Maria'],
    ['Ana Maria Souza', 'Ana M. Souza'],
    ['Maria da Silva Santos', 'Maria S. Santos'],
    ['João de Souza', 'João Souza'],
    ['  Ana   paula   lima  ', 'Ana P. lima'],
    ['', ''],
  ])('Dado %j, Quando abreviar, Então mostra %j', (full, shown) => {
    expect(abbreviatePatientName(full)).toBe(shown);
  });

  it('Dado nome ausente, Então devolve vazio', () => {
    expect(abbreviatePatientName(undefined)).toBe('');
    expect(abbreviatePatientName(null)).toBe('');
  });

  it('Dado nome com 3+ palavras, Então mantém primeiro e último inteiros e nunca só iniciais', () => {
    const shown = abbreviatePatientName('Mateus Paulo Costa Silva');
    expect(shown.startsWith('Mateus ')).toBe(true);
    expect(shown.endsWith(' Silva')).toBe(true);
  });
});

describe('Feature: homônimos nas listas (segurança do paciente)', () => {
  const row = (patientId: string, patientName: string, birth?: string) => ({
    patientId,
    patientName,
    patientBirthDate: birth ?? null,
  });

  it('Dado dois pacientes que abreviam igual, Então os dois são homônimos', () => {
    const rows = [
      row('a', 'Maria Souza Lima', '1980-03-12T00:00:00.000Z'),
      row('b', 'Maria Santos Lima', '1992-07-01T00:00:00.000Z'),
      row('c', 'Carlos Pereira'),
    ];
    expect(homonymPatientIds(rows)).toEqual(new Set(['a', 'b']));
  });

  it('Dado o mesmo paciente em várias linhas, Então não é homônimo de si mesmo', () => {
    const rows = [row('a', 'Maria Souza Lima'), row('a', 'Maria Souza Lima')];
    expect(homonymPatientIds(rows).size).toBe(0);
  });

  it('Dado nomes que só diferem na caixa, Então também colidem', () => {
    const rows = [row('a', 'ana paula lima'), row('b', 'Ana Paula Lima')];
    expect(homonymPatientIds(rows)).toEqual(new Set(['a', 'b']));
  });

  it('Dado homônimos, Quando montar o rótulo, Então todos os que colidem mostram o nascimento', () => {
    const a = row('a', 'Maria Souza Lima', '1980-03-12T12:00:00.000Z');
    const b = row('b', 'Maria Santos Lima', '1992-07-01T12:00:00.000Z');
    const homonyms = homonymPatientIds([a, b]);
    expect(listPatientName(a, homonyms)).toBe(
      'Maria S. Lima · nasc. 12/03/1980',
    );
    expect(listPatientName(b, homonyms)).toBe(
      'Maria S. Lima · nasc. 01/07/1992',
    );
  });

  it('Dado paciente sem homônimo ou sem data, Então mostra só o nome abreviado', () => {
    const a = row('a', 'Maria Souza Lima', '1980-03-12T12:00:00.000Z');
    expect(listPatientName(a, new Set())).toBe('Maria S. Lima');
    const semData = row('b', 'Maria Santos Lima');
    expect(listPatientName(semData, new Set(['b']))).toBe('Maria S. Lima');
  });
});
