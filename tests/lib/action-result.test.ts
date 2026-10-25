import { describe, expect, it } from 'vitest';
import { unwrapAction } from '@/lib/action-result';

describe('Feature: desembrulhar o envelope da Server Action (#551)', () => {
  it('Dado um sucesso, Quando desembrulha, Então devolve o dado', async () => {
    await expect(
      unwrapAction(Promise.resolve({ success: true, data: 7, error: null })),
    ).resolves.toBe(7);
  });

  it('Dada uma falha, Quando desembrulha, Então lança a mensagem do servidor para o formulário mostrar', async () => {
    await expect(
      unwrapAction(
        Promise.resolve({
          success: false,
          data: null,
          error: 'Horário indisponível',
        }),
      ),
    ).rejects.toThrow('Horário indisponível');
  });
});
