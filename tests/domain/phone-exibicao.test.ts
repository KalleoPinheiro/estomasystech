import { describe, expect, it } from 'vitest';
import { displayBrazilianPhone } from '@/domain/shared/phone';

describe('Feature: telefone na tela (#482)', () => {
  it.each([
    ['11979133735', '(11) 97913-3735'],
    ['+5511979133735', '(11) 97913-3735'],
    ['(11) 97913-3735', '(11) 97913-3735'],
    ['123', '123'],
  ])('Dado %s, Quando exibir, Então mostra %s', (entrada, esperado) => {
    expect(displayBrazilianPhone(entrada)).toBe(esperado);
  });
});
