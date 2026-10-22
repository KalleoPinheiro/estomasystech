import { describe, expect, it } from 'vitest';
import { initialsOf } from '@/components/identity-image';

describe('Feature: Iniciais do avatar ignoram pontuação', () => {
  it.each([
    ['Clínica Homologação (fictícia)', 'CF'],
    ['(fictícia)', 'F'],
    ['Clínica - Alfa', 'CA'],
    ['ana.souza@x', 'A'],
    ['álvaro émerson', 'ÁÉ'],
    ['()', '?'],
    ['   ', '?'],
  ])('Dado o nome %j, Quando tirar as iniciais, Então %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
