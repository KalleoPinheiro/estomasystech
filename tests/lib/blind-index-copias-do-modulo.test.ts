import { describe, expect, it, vi } from 'vitest';
import { isValidationError, ValidationError } from '@/domain/shared/errors';

const PEPPER = 'a'.repeat(64);

describe('Feature: erro de validação reconhecido entre cópias do módulo (#860)', () => {
  it('Dado índice criado por uma cópia do módulo e usado por outra, Quando o termo não normaliza, Então vira o valor de reserva em vez de erro', async () => {
    // No build de produção a Server Action e a rota de API carregam cópias separadas
    // do módulo; o índice guardado no processo vem de quem o criou primeiro.
    const criadora = await import('@/lib/blind-index');
    vi.resetModules();
    const usuaria = await import('@/lib/blind-index');
    expect(usuaria.BlindIndex).not.toBe(criadora.BlindIndex);
    const index = new criadora.BlindIndex({ current: PEPPER });

    expect(
      usuaria.orFallbackOnInvalid(
        () => index.candidates('clinica', 'cpf', 'maria'),
        [],
      ),
    ).toEqual([]);
    expect(
      usuaria.orFallbackOnInvalid(
        () => index.hash('clinica', 'phone', 'abc'),
        null,
      ),
    ).toBeNull();
  });

  it('Dado outro erro vindo de outra cópia, Quando passar pela reserva, Então continua subindo', async () => {
    const criadora = await import('@/lib/blind-index');
    vi.resetModules();
    const usuaria = await import('@/lib/blind-index');
    const index = new criadora.BlindIndex({ current: PEPPER });
    const quebrado = () => {
      index.hash('clinica', 'cpf', '52998224725');
      throw new Error('rede caiu');
    };

    expect(() => usuaria.orFallbackOnInvalid(quebrado, null)).toThrow(
      'rede caiu',
    );
  });

  it('isValidationError: reconhece a classe e o código, e recusa o que não é erro de validação', () => {
    expect(isValidationError(new ValidationError('x'))).toBe(true);
    expect(
      isValidationError(
        Object.assign(new Error('x'), { code: 'VALIDATION_ERROR' }),
      ),
    ).toBe(true);
    expect(isValidationError(new Error('x'))).toBe(false);
    expect(
      isValidationError(Object.assign(new Error('x'), { code: 'CONFLICT' })),
    ).toBe(false);
    expect(isValidationError({ code: 'VALIDATION_ERROR' })).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });
});
