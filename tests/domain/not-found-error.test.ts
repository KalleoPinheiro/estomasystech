import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@/domain/shared/errors';

describe('Feature: texto do 404 com concordância (#657)', () => {
  it('Dada fatura inexistente, Quando o erro vira texto, Então concorda no feminino: «Fatura não encontrada»', () => {
    const error = new NotFoundError('Fatura', 'inv-1');

    expect(error.message).toBe('Fatura não encontrada');
    expect(error.entity).toBe('Fatura');
    expect(error.entityId).toBe('inv-1');
  });

  it('Dada outra entidade, Quando o erro vira texto, Então segue o texto neutro «não encontrado(a)»', () => {
    expect(new NotFoundError('Paciente', 'p-1').message).toBe(
      'Paciente não encontrado(a)',
    );
  });
});
