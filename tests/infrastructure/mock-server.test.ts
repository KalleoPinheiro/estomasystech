import { afterAll, describe, expect, it } from 'vitest';
import { startMockServer } from '@/infrastructure/mocks/server';

describe('Feature: Servidor MSW de homologação (ADR-041)', () => {
  afterAll(() => {
    // O interceptor fica ligado até o fim do processo do arquivo de teste.
  });

  it('Dado startMockServer chamado duas vezes, Então liga uma vez e intercepta o Resend', async () => {
    startMockServer();
    startMockServer();

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      body: JSON.stringify({ to: ['a@b.invalid'] }),
    });

    expect(await response.json()).toEqual({ id: 'mock-email-id' });
  });
});
