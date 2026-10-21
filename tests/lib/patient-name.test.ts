import { describe, expect, it } from 'vitest';
import { abbreviatePatientName } from '@/lib/patient-name';

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
