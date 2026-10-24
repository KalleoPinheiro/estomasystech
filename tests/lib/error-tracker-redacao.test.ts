import { describe, expect, it } from 'vitest';
import { buildEvent, scrubEvent } from '@/lib/observability/error-tracker';

describe('Feature: o GlitchTip só recebe texto sem dado pessoal (#381, ADR-060)', () => {
  it('Dado contexto e mensagem com e-mail e CPF, Quando monta o evento, Então saem mascarados', () => {
    const event = buildEvent({
      context: 'Envio para maria@clinica.com falhou',
      error: { name: 'Error', message: 'CPF 123.456.789-09 inválido' },
      requestId: 'req-12345678',
    });

    expect(event.message).toBe('Envio para [e-mail] falhou');
    expect(event.exception?.values?.[0]?.value).toBe('CPF [número] inválido');
    expect(event.tags).toEqual({ requestId: 'req-12345678' });
  });

  it('Dado evento do SDK com tags, transaction e message, Quando scrub, Então limpa e preserva o requestId', () => {
    const requestId = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';

    const clean = scrubEvent({
      transaction: 'GET /portal/maria@clinica.com',
      tags: { requestId, table: 'users', rota: 'x?token=segredo', n: 3 },
    } as never) as {
      transaction: string;
      tags: Record<string, unknown>;
    };

    expect(clean.transaction).toBe('GET /portal/[e-mail]');
    expect(clean.tags).toEqual({
      requestId,
      table: 'users',
      rota: 'x?token=segredo',
      n: 3,
    });
  });

  it('Dado tag com URL e token, Quando scrub, Então a query some', () => {
    const clean = scrubEvent({
      tags: { link: 'https://x.test/definir-senha?token=abc' },
    } as never) as { tags: Record<string, unknown> };

    expect(clean.tags.link).toBe('https://x.test/definir-senha?[redigido]');
  });
});
